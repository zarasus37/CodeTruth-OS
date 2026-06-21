import "./load-env.js";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";
import { createId } from "@codetruth/core";
import type { Project, Workspace, WorkspaceMember, WorkspaceRole } from "@codetruth/core";
import { ASSIGNABLE_ROLES, getRolePermissions, ROLE_LABELS } from "@codetruth/governance";
import { ingestDirectory } from "@codetruth/ingestion";
import { renderJsonReport, renderMarkdownReport } from "@codetruth/reports";
import { isGitHubAppEnabled } from "@codetruth/github";
import { isLlmEnabled } from "@codetruth/llm";
import { closeQueueConnections, isQueueEnabled } from "@codetruth/queue";
import { createActivityEvent } from "@codetruth/cognition";
import { persistSnapshot, startAnalysis } from "./analysis.js";
import {
  enforceAnalysisGate,
  enforceFeatureGate,
  enforceFileUploadGate,
  enforceProjectCreateGate,
  enforceSeatInviteGate,
  getOrCreateSubscription,
  recordAnalysisUsage,
  recordProjectCreatedUsage,
} from "./billing-service.js";
import { registerBillingRoutes } from "./billing-routes.js";
import { authenticate, findOrCreateUser, refreshUserToken } from "./auth.js";
import { isDevEmailLoginEnabled } from "./oauth.js";
import { registerOAuthRoutes } from "./oauth-routes.js";
import { registerCollaborationRoutes } from "./collaboration-routes.js";
import { dataRoot, snapshotRoot, storageBackend, store, uploadRoot, webRoot } from "./context.js";
import { registerGitHubRoutes } from "./github-routes.js";
import { buildFullReport } from "./report-context.js";
import { registerSnapshotRoutes } from "./snapshot-routes.js";
import { registerCognitionRoutes } from "./cognition-routes.js";
import { registerComplianceRoutes } from "./compliance-routes.js";
import { registerPortfolioRoutes } from "./portfolio-routes.js";
import { registerSpatialRoutes } from "./spatial-routes.js";
import { registerStreamRoutes } from "./stream-routes.js";
import { pingRedis } from "./integrations.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

async function extractUpload(buffer: Buffer): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codetruth-upload-"));
  const zip = new AdmZip(buffer);
  zip.extractAllTo(tempDir, true);
  return tempDir;
}

async function bootstrap() {
  await mkdir(dataRoot, { recursive: true });
  await mkdir(uploadRoot, { recursive: true });
  await mkdir(snapshotRoot, { recursive: true });
  await store.init();

  const app = Fastify({ logger: true });
  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 250 * 1024 * 1024 } });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      try {
        request.rawBody = body as Buffer;
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  app.get("/health", async () => {
    const redisConfigured = isQueueEnabled();
    const redisReachable = redisConfigured ? await pingRedis() : false;

    return {
    status: "ok",
    service: "codetruth-api",
    version: "3.0.0",
    storage: storageBackend,
    analysis: redisReachable ? "redis-queue" : redisConfigured ? "redis-unreachable" : "inline",
    integrations: {
      redis: redisReachable,
      redisConfigured,
      redisUrl: process.env.REDIS_URL ? "configured" : "missing",
      llmCouncil: isLlmEnabled(),
      llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
      githubApp: isGitHubAppEnabled(),
      githubAppId: process.env.GITHUB_APP_ID ?? null,
      githubPat: Boolean(process.env.GITHUB_TOKEN),
    },
    features: [
      "workspaces",
      "rbac",
      "web-ui",
      storageBackend === "postgres" ? "postgres" : "json-store",
      redisReachable ? "async-analysis" : "sync-analysis",
      redisReachable ? "sse-redis-pubsub" : "sse-poll",
      "github-webhooks",
      "collaboration",
      "report-signing",
      "task-export",
      "ast-parsing",
      "sse-streaming",
      "snapshot-diff",
      "spatial-navigator",
      "spatial-diff-overlay",
      "portfolio-navigator",
      "cognition-os",
      "live-reanalysis",
      "institutional-compliance",
      "portfolio-trends",
      "oauth",
      "stripe-billing",
      "feature-gates",
      "usage-metering",
      isGitHubAppEnabled() ? "github-app" : "github-pat",
      isLlmEnabled() ? "llm-truth-council" : "heuristic-truth-council",
    ],
    billing: {
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      oauth: {
        github: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID),
        google: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
        devEmail: isDevEmailLoginEnabled(),
      },
    },
  };
  });

  app.post<{ Body: { token?: string } }>("/auth/refresh", async (request, reply) => {
    const token = request.body?.token?.trim();
    if (!token) return reply.code(400).send({ error: "token is required" });
    const user = await refreshUserToken(token);
    if (!user) return reply.code(401).send({ error: "Invalid token" });
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      token: user.apiToken,
    };
  });

  app.post<{ Body: { email?: string; displayName?: string } }>("/auth/session", async (request, reply) => {
    if (!isDevEmailLoginEnabled()) {
      return reply.code(403).send({ error: "Dev email login is disabled. Use OAuth." });
    }

    const email = request.body?.email?.trim();
    if (!email) return reply.code(400).send({ error: "email is required" });

    const user = await findOrCreateUser(email, request.body?.displayName ?? email);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      token: user.apiToken,
    };
  });

  app.get("/users/me", { preHandler: authenticate }, async (request) => {
    const memberships = await store.listUserWorkspaces(request.user!.id);
    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await store.getWorkspace(membership.workspaceId);
        return workspace
          ? {
              ...workspace,
              role: membership.role,
              permissions: getRolePermissions(membership.role),
            }
          : null;
      }),
    );

    return {
      user: request.user,
      workspaces: workspaces.filter(Boolean),
    };
  });

  app.get("/rbac/roles", async () => ({
    roles: Object.entries(ROLE_LABELS).map(([id, label]) => ({
      id,
      label,
      permissions: getRolePermissions(id as WorkspaceRole),
    })),
    assignable: ASSIGNABLE_ROLES,
  }));

  app.post<{ Body: { name?: string } }>(
    "/workspaces",
    { preHandler: authenticate },
    async (request, reply) => {
      const name = request.body?.name?.trim() || "My Workspace";
      const workspace: Workspace = {
        id: createId("ws"),
        name,
        createdAt: new Date().toISOString(),
        createdBy: request.user!.id,
      };
      const membership: WorkspaceMember = {
        workspaceId: workspace.id,
        userId: request.user!.id,
        role: "owner",
        joinedAt: new Date().toISOString(),
      };

      await store.saveWorkspace(workspace);
      await store.saveMember(membership);
      await getOrCreateSubscription(workspace.id);
      await recordAudit({
        workspaceId: workspace.id,
        userId: request.user!.id,
        action: "workspace.created",
        resourceType: "workspace",
        resourceId: workspace.id,
      });

      return reply.code(201).send({
        workspace,
        membership,
        permissions: getRolePermissions("owner"),
      });
    },
  );

  app.get("/workspaces", { preHandler: authenticate }, async (request) => {
    const memberships = await store.listUserWorkspaces(request.user!.id);
    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await store.getWorkspace(membership.workspaceId);
        if (!workspace) return null;
        return {
          ...workspace,
          role: membership.role,
          permissions: getRolePermissions(membership.role),
        };
      }),
    );
    return { workspaces: workspaces.filter(Boolean) };
  });

  app.get<{ Params: { id: string } }>(
    "/workspaces/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(request, reply, request.params.id, "report:view");
      if (!member) return;

      const workspace = await store.getWorkspace(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" });

      const members = await store.listWorkspaceMembers(workspace.id);
      const users = await Promise.all(
        members.map(async (entry) => {
          const user = await store.getUser(entry.userId);
          return user
            ? {
                userId: user.id,
                email: user.email,
                displayName: user.displayName,
                role: entry.role,
                joinedAt: entry.joinedAt,
              }
            : null;
        }),
      );

      return {
        workspace,
        role: member.role,
        permissions: getRolePermissions(member.role),
        members: users.filter(Boolean),
      };
    },
  );

  app.post<{ Params: { id: string }; Body: { email?: string; role?: WorkspaceRole } }>(
    "/workspaces/:id/invite",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(request, reply, request.params.id, "workspace:invite");
      if (!member) return;
      if (!(await enforceSeatInviteGate(request.params.id, reply))) return;

      const email = request.body?.email?.trim();
      const role = request.body?.role ?? "viewer";
      if (!email) return reply.code(400).send({ error: "email is required" });
      if (!ASSIGNABLE_ROLES.includes(role) && role !== "owner") {
        return reply.code(400).send({ error: "Invalid role for invitation" });
      }
      if (role === "owner") {
        return reply.code(400).send({ error: "Cannot assign owner via invite" });
      }

      const user = await findOrCreateUser(email, email.split("@")[0] ?? "Member");
      const existing = await store.getMember(request.params.id, user.id);
      if (existing) {
        return reply.code(409).send({ error: "User is already a workspace member" });
      }

      const membership: WorkspaceMember = {
        workspaceId: request.params.id,
        userId: user.id,
        role,
        joinedAt: new Date().toISOString(),
      };
      await store.saveMember(membership);
      await recordAudit({
        workspaceId: request.params.id,
        userId: request.user!.id,
        action: "workspace.member_invited",
        resourceType: "workspace_member",
        resourceId: user.id,
        metadata: { email, role },
      });

      return reply.code(201).send({ membership, user: { id: user.id, email: user.email, displayName: user.displayName } });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/audit",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(request, reply, request.params.id, "workspace:manage");
      if (!member) return;
      return { entries: await store.listAudit(request.params.id) };
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/projects",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(request, reply, request.params.workspaceId, "report:view");
      if (!member) return;
      return { projects: await store.listProjects(request.params.workspaceId) };
    },
  );

  app.post<{ Params: { workspaceId: string }; Body: { name?: string } }>(
    "/workspaces/:workspaceId/projects",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "project:create",
      );
      if (!member) return;
      if (!(await enforceProjectCreateGate(request.params.workspaceId, reply))) return;

      const project: Project = {
        id: createId("project"),
        workspaceId: request.params.workspaceId,
        name: request.body?.name?.trim() || "Untitled Project",
        createdAt: new Date().toISOString(),
      };
      await store.saveProject(project);
      await recordProjectCreatedUsage(request.params.workspaceId);
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "project.created",
        resourceType: "project",
        resourceId: project.id,
      });

      return reply.code(201).send({ project });
    },
  );

  app.post<{ Params: { workspaceId: string; projectId: string } }>(
    "/workspaces/:workspaceId/projects/:projectId/upload",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "analysis:trigger",
      );
      if (!member) return;
      if (!(await enforceAnalysisGate(request.params.workspaceId, "upload", reply))) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "Expected multipart file upload" });

      const buffer = await file.toBuffer();
      const tempDir = await extractUpload(buffer);

      try {
        const parentSnapshotId = project.latestSnapshotId;
        const snapshot = await ingestDirectory({
          projectId: project.id,
          sourceRoot: tempDir,
          destinationRoot: snapshotRoot,
          parentSnapshotId,
        });
        if (!(await enforceFileUploadGate(request.params.workspaceId, snapshot.fileCount, reply))) {
          return;
        }

        await persistSnapshot(snapshot);

        project.latestSnapshotId = snapshot.id;
        await store.saveProject(project);

        const analysis = await startAnalysis(project, snapshot.id, {
          workspaceId: request.params.workspaceId,
          triggeredBy: "upload",
          incrementalBaseSnapshotId: parentSnapshotId,
        });
        await recordAnalysisUsage(request.params.workspaceId);
        await store.appendCognitionActivity(
          createActivityEvent({
            workspaceId: request.params.workspaceId,
            projectId: project.id,
            analysisId: analysis.id,
            type: "analysis_started",
            summary: `${project.name} analysis started (upload)`,
            metadata: { snapshotId: snapshot.id },
          }),
        );
        await recordAudit({
          workspaceId: request.params.workspaceId,
          userId: request.user!.id,
          action: "analysis.triggered",
          resourceType: "analysis",
          resourceId: analysis.id,
          metadata: { projectId: project.id, snapshotId: snapshot.id },
        });

        return reply.code(202).send({ snapshot, analysis });
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/analyses/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const analysis = await store.getAnalysis(request.params.id);
      if (!analysis) return reply.code(404).send({ error: "Analysis not found" });

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;

      return { analysis, project };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/analyses/:id/report",
    { preHandler: authenticate },
    async (request, reply) => {
      const analysis = await store.getAnalysis(request.params.id);
      if (!analysis?.artifacts) return reply.code(404).send({ error: "Report not ready" });

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;
      if (!(await enforceFeatureGate(project.workspaceId, "exports", reply))) return;

      const report = (await buildFullReport(analysis.id))!;
      const format = request.query.format ?? "json";

      if (format === "markdown" || format === "md") {
        reply.header("content-type", "text/markdown; charset=utf-8");
        return renderMarkdownReport(report);
      }

      return { report };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/analyses/:id/report.md",
    { preHandler: authenticate },
    async (request, reply) => {
      const analysis = await store.getAnalysis(request.params.id);
      if (!analysis?.artifacts) return reply.code(404).send({ error: "Report not ready" });

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;
      if (!(await enforceFeatureGate(project.workspaceId, "exports", reply))) return;

      const report = (await buildFullReport(analysis.id))!;
      reply.header("content-type", "text/markdown; charset=utf-8");
      return renderMarkdownReport(report);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/analyses/:id/report.json",
    { preHandler: authenticate },
    async (request, reply) => {
      const analysis = await store.getAnalysis(request.params.id);
      if (!analysis?.artifacts) return reply.code(404).send({ error: "Report not ready" });

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;
      if (!(await enforceFeatureGate(project.workspaceId, "exports", reply))) return;

      const report = (await buildFullReport(analysis.id))!;
      reply.header("content-type", "application/json; charset=utf-8");
      return renderJsonReport(report);
    },
  );

  await registerOAuthRoutes(app);
  await registerBillingRoutes(app);
  await registerCollaborationRoutes(app);
  await registerStreamRoutes(app);
  await registerSnapshotRoutes(app);
  await registerSpatialRoutes(app);
  await registerPortfolioRoutes(app);
  await registerComplianceRoutes(app);
  await registerCognitionRoutes(app);
  await registerGitHubRoutes(app);

  await app.register(staticPlugin, {
    root: webRoot,
    prefix: "/",
    decorateReply: false,
  });

  const port = Number(process.env.PORT ?? 4310);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`CodeTruth API listening on http://localhost:${port}`);
  console.log(`Storage backend: ${storageBackend}`);
  console.log(`Web UI available at http://localhost:${port}/`);

  const shutdown = async () => {
    await closeQueueConnections();
    await store.disconnect?.();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});