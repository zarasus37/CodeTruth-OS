import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { store } from "./context.js";
import { requireWorkspaceAccess } from "./rbac.js";

export async function registerSpatialRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/analyses/:id/spatial",
    { preHandler: authenticate },
    async (request, reply) => {
      const analysis = await store.getAnalysis(request.params.id);
      if (!analysis?.artifacts?.spatialGraph) {
        return reply.code(404).send({ error: "Spatial graph not ready" });
      }

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;

      return {
        analysisId: analysis.id,
        spatialGraph: analysis.artifacts.spatialGraph,
        stats: {
          nodes: analysis.artifacts.spatialGraph.nodes.length,
          edges: analysis.artifacts.spatialGraph.edges.length,
          layers: analysis.artifacts.spatialGraph.layers.length,
        },
      };
    },
  );
}