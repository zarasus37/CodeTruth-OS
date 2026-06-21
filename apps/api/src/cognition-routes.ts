import type { FastifyInstance } from "fastify";
import { createId, type CognitionActivityEvent, type ReAnalysisInterval } from "@codetruth/core";
import {
  advanceSchedule,
  buildPortfolioTrendSeries,
  computeNextRunAt,
  createActivityEvent,
} from "@codetruth/cognition";
import {
  enforceAnalysisGate,
  enforceFeatureGate,
  recordAnalysisUsage,
} from "./billing-service.js";
import { authenticate } from "./auth.js";
import { startAnalysis } from "./analysis.js";
import { buildWorkspaceInstitutionalView } from "./cognition-helpers.js";
import { store } from "./context.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";

const VALID_INTERVALS = new Set<ReAnalysisInterval>(["6h", "12h", "24h", "7d", "30d"]);

function sseWrite(reply: { raw: NodeJS.WritableStream }, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerCognitionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { workspaceId: string }; Querystring: { access_token?: string } }>(
    "/workspaces/:workspaceId/cognition/stream",
    async (request, reply) => {
      const queryToken = request.query.access_token?.trim();
      if (queryToken && !request.headers.authorization) {
        request.headers.authorization = `Bearer ${queryToken}`;
      }
      await authenticate(request, reply);
      if (reply.sent) return;

      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let closed = false;
      const seen = new Set<string>();

      const pushEvents = (events: CognitionActivityEvent[]) => {
        for (const event of events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          sseWrite(reply, "activity", event);
        }
      };

      const initial = await store.listCognitionActivity(request.params.workspaceId, 50);
      for (const event of initial) {
        seen.add(event.id);
      }

      const poll = setInterval(async () => {
        if (closed) return;
        const latest = await store.listCognitionActivity(request.params.workspaceId, 25);
        pushEvents(latest);
      }, 2000);

      request.raw.on("close", () => {
        closed = true;
        clearInterval(poll);
      });
    },
  );

  app.get<{ Params: { workspaceId: string; projectId: string } }>(
    "/workspaces/:workspaceId/projects/:projectId/timeline",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const analyses = await store.listAnalyses(project.id);
      const view = await buildWorkspaceInstitutionalView(request.params.workspaceId);
      const complianceByProject = new Map(
        view.compliance.projects.map((p) => [p.projectId, p.overallComplianceScore]),
      );

      const points = buildPortfolioTrendSeries(
        [project],
        new Map([[project.id, analyses]]),
        complianceByProject,
      );

      return {
        projectId: project.id,
        projectName: project.name,
        points: points.sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
      };
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/cognition/activity",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      return {
        events: await store.listCognitionActivity(request.params.workspaceId, 100),
      };
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/cognition/portfolio",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "portfolio", reply))) return;

      return buildWorkspaceInstitutionalView(request.params.workspaceId);
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/cognition/schedules",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      return { schedules: await store.listReAnalysisSchedules(request.params.workspaceId) };
    },
  );

  app.put<{
    Params: { workspaceId: string; projectId: string };
    Body: { enabled?: boolean; interval?: ReAnalysisInterval };
  }>(
    "/workspaces/:workspaceId/cognition/schedules/:projectId",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "analysis:trigger",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "live_reanalysis", reply))) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const interval = request.body?.interval ?? "24h";
      if (!VALID_INTERVALS.has(interval)) {
        return reply.code(400).send({ error: "Invalid re-analysis interval" });
      }

      const existing = await store.getReAnalysisScheduleByProject(
        request.params.workspaceId,
        request.params.projectId,
      );

      const enabled = request.body?.enabled ?? existing?.enabled ?? true;
      const schedule = existing
        ? {
            ...existing,
            enabled,
            interval,
            nextRunAt: enabled
              ? existing.nextRunAt ?? computeNextRunAt(interval)
              : undefined,
          }
        : {
            id: createId("sched"),
            workspaceId: request.params.workspaceId,
            projectId: request.params.projectId,
            enabled,
            interval,
            nextRunAt: enabled ? computeNextRunAt(interval) : undefined,
            createdAt: new Date().toISOString(),
            createdBy: request.user!.id,
          };

      await store.saveReAnalysisSchedule(schedule);
      await store.appendCognitionActivity(
        createActivityEvent({
          workspaceId: request.params.workspaceId,
          projectId: project.id,
          type: "reanalysis_scheduled",
          summary: `${project.name} live re-analysis ${enabled ? "enabled" : "disabled"} (${interval})`,
          metadata: { interval, enabled },
        }),
      );
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "cognition.schedule_updated",
        resourceType: "reanalysis_schedule",
        resourceId: schedule.id,
        metadata: { projectId: project.id, interval, enabled },
      });

      return { schedule };
    },
  );

  app.post<{ Params: { workspaceId: string; projectId: string } }>(
    "/workspaces/:workspaceId/cognition/reanalyze/:projectId",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "analysis:trigger",
      );
      if (!member) return;
      if (!(await enforceAnalysisGate(request.params.workspaceId, "reanalysis", reply))) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }
      if (!project.latestSnapshotId) {
        return reply.code(400).send({ error: "Project has no snapshot to re-analyze" });
      }

      const analyses = await store.listAnalyses(project.id);
      const previous = analyses
        .filter((a) => a.status === "completed")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];

      const analysis = await startAnalysis(project, project.latestSnapshotId, {
        workspaceId: request.params.workspaceId,
        triggeredBy: "reanalysis",
        incrementalBaseSnapshotId: previous?.snapshotId,
      });
      await recordAnalysisUsage(request.params.workspaceId);

      await store.appendCognitionActivity(
        createActivityEvent({
          workspaceId: request.params.workspaceId,
          projectId: project.id,
          analysisId: analysis.id,
          type: "reanalysis_triggered",
          summary: `Live re-analysis triggered for ${project.name}`,
          metadata: { snapshotId: project.latestSnapshotId },
        }),
      );
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "analysis.reanalysis_triggered",
        resourceType: "analysis",
        resourceId: analysis.id,
        metadata: { projectId: project.id },
      });

      return reply.code(202).send({ analysis });
    },
  );
}