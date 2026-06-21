import type { FastifyInstance } from "fastify";
import { createId } from "@codetruth/core";
import type { DueDiligenceEngagement, DueDiligenceStage } from "@codetruth/core";
import { DUE_DILIGENCE_STAGES, generateDueDiligencePlaybook } from "@codetruth/sovereign";
import { authenticate } from "./auth.js";
import { enforceFeatureGate } from "./billing-service.js";
import { store } from "./context.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";
import { trackEvent } from "./telemetry-service.js";

function latestCompletedAnalysis(analyses: Awaited<ReturnType<typeof store.listAnalyses>>) {
  return analyses
    .filter((a) => a.status === "completed" && a.artifacts)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
}

export async function registerSovereignRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/due-diligence",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "sovereign_services", reply))) {
        return;
      }

      const engagements = await store.listDueDiligenceEngagements(request.params.workspaceId);
      return { engagements, stages: DUE_DILIGENCE_STAGES };
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      projectId: string;
      title: string;
      clientName?: string;
      analysisId?: string;
      stage?: DueDiligenceStage;
      notes?: string;
    };
  }>(
    "/workspaces/:workspaceId/due-diligence",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "sovereign_services", reply))) {
        return;
      }

      const project = await store.getProject(request.body.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const now = new Date().toISOString();
      const engagement: DueDiligenceEngagement = {
        id: createId("dd"),
        workspaceId: request.params.workspaceId,
        projectId: project.id,
        analysisId: request.body.analysisId,
        title: request.body.title,
        clientName: request.body.clientName,
        stage: request.body.stage ?? "intake",
        notes: request.body.notes,
        createdAt: now,
        createdBy: request.user!.id,
        updatedAt: now,
      };

      await store.saveDueDiligenceEngagement(engagement);
      await recordAudit({
        workspaceId: engagement.workspaceId,
        userId: request.user!.id,
        action: "due_diligence.created",
        resourceType: "due_diligence_engagement",
        resourceId: engagement.id,
      });
      await trackEvent("sovereign.engagement_created", {
        userId: request.user!.id,
        workspaceId: engagement.workspaceId,
        projectId: engagement.projectId,
        properties: { engagementId: engagement.id, stage: engagement.stage },
      });

      return { engagement };
    },
  );

  app.patch<{
    Params: { workspaceId: string; engagementId: string };
    Body: Partial<Pick<DueDiligenceEngagement, "stage" | "notes" | "analysisId" | "title" | "clientName">>;
  }>(
    "/workspaces/:workspaceId/due-diligence/:engagementId",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "sovereign_services", reply))) {
        return;
      }

      const engagement = await store.getDueDiligenceEngagement(request.params.engagementId);
      if (!engagement || engagement.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Engagement not found" });
      }

      const updated: DueDiligenceEngagement = {
        ...engagement,
        ...request.body,
        updatedAt: new Date().toISOString(),
      };
      await store.saveDueDiligenceEngagement(updated);
      return { engagement: updated };
    },
  );

  app.get<{ Params: { workspaceId: string; engagementId: string } }>(
    "/workspaces/:workspaceId/due-diligence/:engagementId/playbook.md",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "sovereign_services", reply))) {
        return;
      }

      const engagement = await store.getDueDiligenceEngagement(request.params.engagementId);
      if (!engagement || engagement.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Engagement not found" });
      }

      const project = await store.getProject(engagement.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const analyses = await store.listAnalyses(project.id);
      const analysis =
        (engagement.analysisId
          ? analyses.find((a) => a.id === engagement.analysisId && a.artifacts)
          : undefined) ?? latestCompletedAnalysis(analyses);

      if (!analysis?.artifacts) {
        return reply.code(404).send({ error: "No completed analysis artifacts for playbook export" });
      }

      const workspace = await store.getWorkspace(request.params.workspaceId);
      const markdown = generateDueDiligencePlaybook(engagement, analysis.artifacts, {
        workspaceName: workspace?.name,
        dataResidency: workspace?.settings?.dataResidency,
      });

      await trackEvent("sovereign.playbook_exported", {
        userId: request.user!.id,
        workspaceId: request.params.workspaceId,
        projectId: project.id,
        analysisId: analysis.id,
        properties: { engagementId: engagement.id },
      });

      reply.header("Content-Type", "text/markdown; charset=utf-8");
      reply.header(
        "Content-Disposition",
        `attachment; filename="due-diligence-${engagement.id}.md"`,
      );
      return markdown;
    },
  );
}