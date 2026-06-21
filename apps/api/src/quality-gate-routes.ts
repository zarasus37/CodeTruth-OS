import type { FastifyInstance } from "fastify";
import type { QualityGatePolicy, SeverityLevel } from "@codetruth/core";
import {
  evaluateQualityGate,
  mergeQualityGatePolicy,
  parseBlockSeverities,
} from "@codetruth/governance";
import { authenticate } from "./auth.js";
import { enforceFeatureGate } from "./billing-service.js";
import { store } from "./context.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";

function latestCompletedAnalysis(analyses: Awaited<ReturnType<typeof store.listAnalyses>>) {
  return analyses
    .filter((a) => a.status === "completed" && a.artifacts)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
}

async function resolveProject(
  workspaceId: string,
  projectId?: string,
  owner?: string,
  repo?: string,
) {
  if (projectId) {
    const project = await store.getProject(projectId);
    if (!project || project.workspaceId !== workspaceId) return undefined;
    return project;
  }
  if (owner && repo) {
    const project = await store.getProjectByGithub(owner, repo);
    if (!project || project.workspaceId !== workspaceId) return undefined;
    return project;
  }
  return undefined;
}

export async function registerQualityGateRoutes(app: FastifyInstance): Promise<void> {
  app.put<{
    Params: { workspaceId: string; projectId: string };
    Body: { blockSeverities?: SeverityLevel[]; minOverallScore?: number };
  }>(
    "/workspaces/:workspaceId/projects/:projectId/quality-gate/policy",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "quality_gate", reply))) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const policy: QualityGatePolicy = {
        blockSeverities:
          request.body?.blockSeverities ?? project.qualityGate?.blockSeverities ?? [
            "Critical blocker",
            "High-risk flaw",
          ],
        minOverallScore: request.body?.minOverallScore ?? project.qualityGate?.minOverallScore,
      };

      project.qualityGate = policy;
      await store.saveProject(project);
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "project.quality_gate_updated",
        resourceType: "project",
        resourceId: project.id,
        metadata: { blockSeverities: policy.blockSeverities, minOverallScore: policy.minOverallScore },
      });

      return { project, policy };
    },
  );

  app.get<{
    Params: { workspaceId: string; projectId: string };
    Querystring: {
      blockSeverities?: string;
      minOverallScore?: string;
      analysisId?: string;
    };
  }>(
    "/workspaces/:workspaceId/projects/:projectId/quality-gate",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "quality_gate", reply))) return;

      const project = await store.getProject(request.params.projectId);
      if (!project || project.workspaceId !== request.params.workspaceId) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const analyses = await store.listAnalyses(project.id);
      const analysis = request.query.analysisId
        ? analyses.find((a) => a.id === request.query.analysisId)
        : latestCompletedAnalysis(analyses);

      if (!analysis?.artifacts) {
        const result = evaluateQualityGate({ findings: [], policy: project.qualityGate });
        return reply.code(404).send({ error: "No completed analysis for quality gate", result });
      }

      const policy = mergeQualityGatePolicy(project.qualityGate, {
        blockSeverities: parseBlockSeverities(request.query.blockSeverities),
        minOverallScore: request.query.minOverallScore
          ? Number(request.query.minOverallScore)
          : undefined,
      });

      const reviews = await store.listFindingReviews(analysis.id);
      const result = evaluateQualityGate({
        findings: analysis.artifacts.findings,
        reviews,
        overallScore: analysis.artifacts.scorecard.overall,
        policy,
        analysisId: analysis.id,
        snapshotId: analysis.snapshotId,
      });

      if (!result.passed) {
        return reply.code(422).send({ result, project: { id: project.id, name: project.name } });
      }

      return { result, project: { id: project.id, name: project.name } };
    },
  );

  /** CI-friendly lookup by GitHub coordinates (Team tier). */
  app.get<{
    Params: { workspaceId: string };
    Querystring: {
      owner?: string;
      repo?: string;
      projectId?: string;
      blockSeverities?: string;
      minOverallScore?: string;
      analysisId?: string;
    };
  }>(
    "/workspaces/:workspaceId/quality-gate",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "quality_gate", reply))) return;

      const project = await resolveProject(
        request.params.workspaceId,
        request.query.projectId,
        request.query.owner,
        request.query.repo,
      );
      if (!project) {
        return reply.code(404).send({ error: "Project not found for quality gate lookup" });
      }

      const analyses = await store.listAnalyses(project.id);
      const analysis = request.query.analysisId
        ? analyses.find((a) => a.id === request.query.analysisId)
        : latestCompletedAnalysis(analyses);

      if (!analysis?.artifacts) {
        const result = evaluateQualityGate({ findings: [], policy: project.qualityGate });
        return reply.code(404).send({ error: "No completed analysis for quality gate", result });
      }

      const policy = mergeQualityGatePolicy(project.qualityGate, {
        blockSeverities: parseBlockSeverities(request.query.blockSeverities),
        minOverallScore: request.query.minOverallScore
          ? Number(request.query.minOverallScore)
          : undefined,
      });

      const reviews = await store.listFindingReviews(analysis.id);
      const result = evaluateQualityGate({
        findings: analysis.artifacts.findings,
        reviews,
        overallScore: analysis.artifacts.scorecard.overall,
        policy,
        analysisId: analysis.id,
        snapshotId: analysis.snapshotId,
      });

      if (!result.passed) {
        return reply.code(422).send({ result, project: { id: project.id, name: project.name } });
      }

      return { result, project: { id: project.id, name: project.name } };
    },
  );
}