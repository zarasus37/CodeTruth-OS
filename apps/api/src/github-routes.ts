import { rm } from "node:fs/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createId } from "@codetruth/core";
import type { GitHubProjectConfig } from "@codetruth/core";
import {
  generateWebhookSecret,
  isGitHubAppEnabled,
  loadGitHubAppConfig,
  parseInstallationEvent,
  parsePushEvent,
  verifyWebhookSignature,
  type GitHubInstallationEvent,
  type GitHubPushEvent,
} from "@codetruth/github";
import { persistSnapshot, startAnalysis } from "./analysis.js";
import { authenticate } from "./auth.js";
import { ingestGitHubRepository } from "./github-ingest.js";
import { store } from "./context.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

function publicApiUrl(request: FastifyRequest): string {
  return (
    process.env.PUBLIC_API_URL ??
    `${request.protocol}://${request.hostname}${request.port ? `:${request.port}` : ""}`
  );
}

export async function registerGitHubRoutes(app: FastifyInstance): Promise<void> {
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

  app.post<{
    Params: { workspaceId: string; projectId: string };
    Body: {
      owner?: string;
      repo?: string;
      defaultBranch?: string;
      webhookSecret?: string;
      installationId?: number;
      authMode?: "pat" | "app";
    };
  }>(
    "/workspaces/:workspaceId/projects/:projectId/github/connect",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "analysis:trigger",
      );
      if (!member) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const owner = request.body?.owner?.trim();
      const repo = request.body?.repo?.trim();
      if (!owner || !repo) {
        return reply.code(400).send({ error: "owner and repo are required" });
      }

      const existing = await store.getProjectByGithub(owner, repo);
      if (existing && existing.id !== project.id) {
        return reply.code(409).send({ error: "Repository already connected to another project" });
      }

      const authMode = request.body?.authMode ?? (request.body?.installationId ? "app" : "pat");
      const github: GitHubProjectConfig = {
        owner,
        repo,
        defaultBranch: request.body?.defaultBranch?.trim() || "main",
        webhookSecret: request.body?.webhookSecret?.trim() || generateWebhookSecret(),
        connectedAt: new Date().toISOString(),
        authMode,
        installationId: request.body?.installationId,
      };

      project.github = github;
      await store.saveProject(project);
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "project.github_connected",
        resourceType: "project",
        resourceId: project.id,
        metadata: { owner, repo },
      });

      const appConfig = await loadGitHubAppConfig();
      return {
        project,
        authMode,
        githubAppEnabled: isGitHubAppEnabled(),
        webhook: {
          url: `${publicApiUrl(request)}/webhooks/github`,
          secret: authMode === "app" && appConfig?.webhookSecret ? appConfig.webhookSecret : github.webhookSecret,
          events: authMode === "app" ? ["push", "installation"] : ["push"],
        },
      };
    },
  );

  app.post("/webhooks/github", async (request, reply) => {
    const event = request.headers["x-github-event"];
    const deliveryId = request.headers["x-github-delivery"];
    const rawBody = request.rawBody;
    const signature = request.headers["x-hub-signature-256"];
    const appConfig = await loadGitHubAppConfig();

    async function verifySignature(secret: string | undefined): Promise<boolean> {
      if (!secret || !rawBody) return false;
      return verifyWebhookSignature(rawBody, typeof signature === "string" ? signature : undefined, secret);
    }

    if (event === "installation" || event === "installation_repositories") {
      const webhookSecret = appConfig?.webhookSecret;
      if (!(await verifySignature(webhookSecret))) {
        return reply.code(401).send({ error: "Invalid webhook signature" });
      }

      const payload = request.body as GitHubInstallationEvent;
      const { installationId, account, repositories } = parseInstallationEvent(payload);
      const linked: string[] = [];

      if (account) {
        for (const repoName of repositories) {
          const project = await store.getProjectByGithub(account, repoName);
          if (!project?.github) continue;
          project.github.authMode = "app";
          project.github.installationId = installationId;
          await store.saveProject(project);
          linked.push(project.id);
        }
      }

      return reply.code(202).send({
        accepted: true,
        installationId,
        linkedProjects: linked,
        deliveryId,
      });
    }

    if (event !== "push") {
      return reply.code(202).send({ accepted: false, reason: `Ignored event: ${event ?? "unknown"}` });
    }

    const payload = request.body as GitHubPushEvent;
    const { owner, repo, branch } = parsePushEvent(payload);
    const project = await store.getProjectByGithub(owner, repo);
    if (!project?.github) {
      return reply.code(404).send({ error: "No connected project for repository" });
    }

    const webhookSecret =
      project.github.authMode === "app" && appConfig?.webhookSecret
        ? appConfig.webhookSecret
        : project.github.webhookSecret;
    if (!(await verifySignature(webhookSecret))) {
      return reply.code(401).send({ error: "Invalid webhook signature" });
    }

    const ref = branch || project.github.defaultBranch;
    let tempDir = "";

    try {
      const result = await ingestGitHubRepository({
        project,
        owner,
        repo,
        ref,
        token: project.github.authMode === "app" ? undefined : process.env.GITHUB_TOKEN,
      });
      tempDir = result.tempDir;

      project.latestSnapshotId = result.snapshot.id;
      project.github.defaultBranch = ref;
      await store.saveProject(project);

      const analysis = await startAnalysis(project, result.snapshot.id, {
        workspaceId: project.workspaceId,
        triggeredBy: "github_webhook",
        incrementalBaseSnapshotId: result.snapshot.parentSnapshotId,
      });

      await recordAudit({
        workspaceId: project.workspaceId,
        userId: "system:github",
        action: "analysis.triggered.github",
        resourceType: "analysis",
        resourceId: analysis.id,
        metadata: {
          deliveryId,
          owner,
          repo,
          ref,
          snapshotId: result.snapshot.id,
        },
      });

      return reply.code(202).send({
        accepted: true,
        projectId: project.id,
        snapshotId: result.snapshot.id,
        analysisId: analysis.id,
      });
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : "GitHub ingestion failed",
      });
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  });
}