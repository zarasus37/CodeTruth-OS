import type { FastifyInstance } from "fastify";
import type { DataResidencyRegion, SsoProvider, WorkspaceSettings } from "@codetruth/core";
import { defaultDataResidency } from "@codetruth/sovereign";
import { authenticate } from "./auth.js";
import { enforceFeatureGate } from "./billing-service.js";
import { store } from "./context.js";
import {
  entraAuthorizeUrl,
  isEntraOAuthEnabled,
  isOktaOAuthEnabled,
  oktaAuthorizeUrl,
  signOAuthState,
} from "./oauth.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";
import { trackEvent } from "./telemetry-service.js";

const RESIDENCY_REGIONS: DataResidencyRegion[] = ["us", "eu", "apac", "sovereign"];
const SSO_PROVIDERS: SsoProvider[] = ["entra", "okta"];

function mergeSettings(
  current: WorkspaceSettings | undefined,
  body: Partial<WorkspaceSettings>,
): WorkspaceSettings {
  return {
    ...current,
    dataResidency: body.dataResidency ?? current?.dataResidency ?? defaultDataResidency(),
    sso: body.sso ? { ...current?.sso, ...body.sso } : current?.sso,
    enabledMarketplaceAnalyzers:
      body.enabledMarketplaceAnalyzers ?? current?.enabledMarketplaceAnalyzers,
  };
}

export async function registerEnterpriseRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/enterprise",
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

      const settings = workspace.settings ?? { dataResidency: defaultDataResidency() };

      return {
        workspaceId: workspace.id,
        settings,
        ssoProviders: {
          entra: isEntraOAuthEnabled(),
          okta: isOktaOAuthEnabled(),
        },
        residencyOptions: RESIDENCY_REGIONS,
      };
    },
  );

  app.put<{
    Params: { workspaceId: string };
    Body: Partial<WorkspaceSettings>;
  }>(
    "/workspaces/:workspaceId/enterprise",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "workspace:manage",
      );
      if (!member) return;

      const workspace = await store.getWorkspace(request.params.workspaceId);
      if (!workspace) return reply.code(404).send({ error: "Workspace not found" });

      if (request.body?.dataResidency) {
        if (!(await enforceFeatureGate(request.params.workspaceId, "data_residency", reply))) return;
        if (!RESIDENCY_REGIONS.includes(request.body.dataResidency)) {
          return reply.code(400).send({ error: "Invalid data residency region" });
        }
      }

      if (request.body?.sso?.enabled) {
        if (!(await enforceFeatureGate(request.params.workspaceId, "sso", reply))) return;
        const provider = request.body.sso.provider ?? workspace.settings?.sso?.provider;
        if (!provider || !SSO_PROVIDERS.includes(provider)) {
          return reply.code(400).send({ error: "SSO provider must be entra or okta" });
        }
        if (provider === "entra" && !isEntraOAuthEnabled()) {
          return reply.code(503).send({ error: "Entra SSO is not configured on this deployment" });
        }
        if (provider === "okta" && !isOktaOAuthEnabled()) {
          return reply.code(503).send({ error: "Okta SSO is not configured on this deployment" });
        }
      }

      workspace.settings = mergeSettings(workspace.settings, request.body ?? {});
      await store.saveWorkspace(workspace);

      await recordAudit({
        workspaceId: workspace.id,
        userId: request.user!.id,
        action: "workspace.enterprise_updated",
        resourceType: "workspace",
        resourceId: workspace.id,
        metadata: {
          dataResidency: workspace.settings.dataResidency,
          ssoEnabled: workspace.settings.sso?.enabled,
        },
      });

      await trackEvent("enterprise.settings_updated", {
        userId: request.user!.id,
        workspaceId: workspace.id,
        properties: {
          dataResidency: workspace.settings.dataResidency,
          ssoProvider: workspace.settings.sso?.provider,
        },
      });

      return { workspace, settings: workspace.settings };
    },
  );

  app.get<{ Params: { workspaceId: string }; Querystring: { provider?: SsoProvider } }>(
    "/workspaces/:workspaceId/sso/login-url",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;
      if (!(await enforceFeatureGate(request.params.workspaceId, "sso", reply))) return;

      const workspace = await store.getWorkspace(request.params.workspaceId);
      if (!workspace?.settings?.sso?.enabled) {
        return reply.code(400).send({ error: "Workspace SSO is not enabled" });
      }

      const provider = request.query.provider ?? workspace.settings.sso.provider;
      if (provider === "entra") {
        if (!isEntraOAuthEnabled()) {
          return reply.code(503).send({ error: "Entra SSO is not configured" });
        }
        const state = signOAuthState("entra");
        return { provider, url: entraAuthorizeUrl(state) };
      }
      if (provider === "okta") {
        if (!isOktaOAuthEnabled()) {
          return reply.code(503).send({ error: "Okta SSO is not configured" });
        }
        const state = signOAuthState("okta");
        return { provider, url: oktaAuthorizeUrl(state) };
      }

      return reply.code(400).send({ error: "Invalid SSO provider" });
    },
  );
}