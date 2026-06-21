import type { FastifyInstance, FastifyRequest } from "fastify";
import type { SubscriptionPlan, SubscriptionStatus } from "@codetruth/core";
import { deploymentRegion, defaultDataResidency } from "@codetruth/sovereign";
import { getOrCreateSubscription } from "./billing-service.js";
import { store } from "./context.js";
import {
  isEntraOAuthEnabled,
  isGitHubOAuthEnabled,
  isGoogleOAuthEnabled,
  isOktaOAuthEnabled,
} from "./oauth.js";

function isAdmin(request: FastifyRequest): boolean {
  const token = (process.env.ADMIN_TOKEN ?? process.env.BETA_ADMIN_TOKEN)?.trim();
  if (!token) return false;
  const header = request.headers.authorization ?? "";
  return header === `Bearer ${token}` || header === token;
}

function requireAdmin(request: FastifyRequest, reply: import("fastify").FastifyReply): boolean {
  if (isAdmin(request)) return true;
  reply.code(403).send({ error: "Admin token required" });
  return false;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/readiness", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const checks = {
      sessionSecret: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      database: Boolean(process.env.DATABASE_URL),
      redis: Boolean(process.env.REDIS_URL),
      publicApiUrl: Boolean(process.env.PUBLIC_API_URL),
      githubApp: Boolean(
        process.env.GITHUB_APP_ID &&
          process.env.GITHUB_APP_PRIVATE_KEY_PATH &&
          process.env.GITHUB_APP_WEBHOOK_SECRET,
      ),
      oauth: {
        github: isGitHubOAuthEnabled(),
        google: isGoogleOAuthEnabled(),
        entra: isEntraOAuthEnabled(),
        okta: isOktaOAuthEnabled(),
      },
      llm: Boolean(process.env.LLM_API_KEY),
      deploymentRegion: deploymentRegion(),
      defaultDataResidency: defaultDataResidency(),
      enforceDataResidency: process.env.ENFORCE_DATA_RESIDENCY === "true",
      betaMode: process.env.BETA_MODE === "true",
    };

    const blockers: string[] = [];
    if (process.env.NODE_ENV === "production") {
      if (!checks.sessionSecret) blockers.push("SESSION_SECRET (32+ chars)");
      if (!checks.publicApiUrl) blockers.push("PUBLIC_API_URL");
      if (!checks.database) blockers.push("DATABASE_URL");
    }

    return {
      ready: blockers.length === 0,
      blockers,
      checks,
      hint: "Run npm run verify:integrations for live probes",
    };
  });

  app.put<{
    Params: { workspaceId: string };
    Body: {
      plan: SubscriptionPlan;
      status?: SubscriptionStatus;
      seatCount?: number;
    };
  }>("/admin/workspaces/:workspaceId/subscription", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const plan = request.body?.plan;
    if (!plan) return reply.code(400).send({ error: "plan is required" });

    const subscription = await getOrCreateSubscription(request.params.workspaceId);
    const updated = {
      ...subscription,
      plan,
      status: request.body.status ?? "active",
      seatCount: request.body.seatCount ?? subscription.seatCount,
      updatedAt: new Date().toISOString(),
    };
    await store.saveWorkspaceSubscription(updated);

    return { subscription: updated };
  });

  app.get<{ Params: { workspaceId: string } }>(
    "/admin/workspaces/:workspaceId/subscription",
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;

      const subscription = await getOrCreateSubscription(request.params.workspaceId);
      const workspace = await store.getWorkspace(request.params.workspaceId);
      return { subscription, workspace };
    },
  );
}