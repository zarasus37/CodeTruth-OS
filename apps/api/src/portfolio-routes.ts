import type { FastifyInstance } from "fastify";
import { enforceFeatureGate } from "./billing-service.js";
import { authenticate } from "./auth.js";
import { buildWorkspaceInstitutionalView } from "./cognition-helpers.js";
import { store } from "./context.js";
import { requireWorkspaceAccess } from "./rbac.js";
import { buildPortfolioSpatialGraph } from "@codetruth/spatial";

function latestCompletedAnalysis(analyses: Awaited<ReturnType<typeof store.listAnalyses>>) {
  return analyses
    .filter((a) => a.status === "completed" && a.artifacts)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
}

export async function registerPortfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/portfolio",
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

      const view = await buildWorkspaceInstitutionalView(request.params.workspaceId);
      const { compliance, trendSeries, recentActivity, schedules, ...portfolio } = view;
      return {
        ...portfolio,
        complianceScore: portfolio.aggregateComplianceScore,
        complianceSummary: {
          openViolations: compliance.openViolations,
          frameworkBreakdown: compliance.frameworkBreakdown,
        },
      };
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/portfolio/spatial",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      const projects = await store.listProjects(request.params.workspaceId);
      const spatialInputs = [];

      for (const project of projects) {
        const analyses = await store.listAnalyses(project.id);
        const latest = latestCompletedAnalysis(analyses);
        if (!latest?.artifacts?.spatialGraph) continue;
        spatialInputs.push({
          projectId: project.id,
          projectName: project.name,
          analysisId: latest.id,
          spatialGraph: latest.artifacts.spatialGraph,
        });
      }

      if (!spatialInputs.length) {
        return reply.code(404).send({ error: "No spatial graphs available in portfolio" });
      }

      const portfolioGraph = buildPortfolioSpatialGraph(spatialInputs);
      return {
        workspaceId: request.params.workspaceId,
        projectCount: spatialInputs.length,
        portfolioGraph,
      };
    },
  );
}