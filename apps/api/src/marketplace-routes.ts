import type { FastifyInstance } from "fastify";
import { listMarketplaceAnalyzers } from "@codetruth/marketplace";
import { authenticate } from "./auth.js";
import { enforceFeatureGate } from "./billing-service.js";
import { store } from "./context.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";
import { trackEvent } from "./telemetry-service.js";

export async function registerMarketplaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/marketplace/analyzers", { preHandler: authenticate }, async () => ({
    analyzers: listMarketplaceAnalyzers(),
    revenueTier: "phase4",
  }));

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/marketplace",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      const workspace = await store.getWorkspace(request.params.workspaceId);
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" });

      return {
        catalog: listMarketplaceAnalyzers(),
        enabled: workspace.settings?.enabledMarketplaceAnalyzers ?? [],
      };
    },
  );

  app.put<{ Params: { workspaceId: string }; Body: { enabledAnalyzerIds: string[] } }>(
    "/workspaces/:workspaceId/marketplace",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "marketplace_analyzers", reply))) {
        return;
      }

      const workspace = await store.getWorkspace(request.params.workspaceId);
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" });

      const catalogIds = new Set(listMarketplaceAnalyzers().map((a) => a.id));
      const enabled = [...new Set(request.body?.enabledAnalyzerIds ?? [])].filter((id) =>
        catalogIds.has(id),
      );

      workspace.settings = {
        ...workspace.settings,
        enabledMarketplaceAnalyzers: enabled,
      };
      await store.saveWorkspace(workspace);

      await recordAudit({
        workspaceId: workspace.id,
        userId: request.user!.id,
        action: "workspace.marketplace_updated",
        resourceType: "workspace",
        resourceId: workspace.id,
        metadata: { enabled },
      });

      for (const analyzerId of enabled) {
        await trackEvent("marketplace.analyzer_enabled", {
          userId: request.user!.id,
          workspaceId: workspace.id,
          properties: { analyzerId },
        });
      }

      return { enabled, catalog: listMarketplaceAnalyzers() };
    },
  );
}