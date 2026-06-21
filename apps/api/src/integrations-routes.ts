import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createGitHubAppJwt,
  isGitHubAppEnabled,
  loadGitHubAppConfig,
} from "@codetruth/github";
import { authenticate } from "./auth.js";

function publicApiUrl(request: FastifyRequest): string {
  return (
    process.env.PUBLIC_API_URL ??
    `${request.protocol}://${request.hostname}${request.port ? `:${request.port}` : ""}`
  );
}

function isPlaceholderAppId(appId: string | undefined): boolean {
  return !appId || appId === "000000" || appId === "0";
}

export async function registerIntegrationsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/integrations/github-app", async (request) => {
    const config = await loadGitHubAppConfig();
    const appId = process.env.GITHUB_APP_ID;
    const slug = process.env.GITHUB_APP_SLUG;
    const publicUrl = publicApiUrl(request);

    let jwtValid = false;
    let jwtError: string | undefined;
    if (config) {
      try {
        createGitHubAppJwt(config);
        jwtValid = true;
      } catch (error) {
        jwtError = error instanceof Error ? error.message : "JWT signing failed";
      }
    }

    const productionReady =
      isGitHubAppEnabled() &&
      !isPlaceholderAppId(appId) &&
      Boolean(config?.webhookSecret) &&
      Boolean(publicUrl && !publicUrl.includes("localhost")) &&
      jwtValid;

    return {
      enabled: isGitHubAppEnabled(),
      productionReady,
      appId: appId ?? null,
      appSlug: slug ?? null,
      webhookUrl: `${publicUrl}/webhooks/github`,
      publicApiUrl: publicUrl,
      checks: {
        appIdConfigured: !isPlaceholderAppId(appId),
        privateKeyLoaded: Boolean(config?.privateKey),
        webhookSecretConfigured: Boolean(config?.webhookSecret),
        publicApiUrlConfigured: Boolean(process.env.PUBLIC_API_URL),
        publicApiUrlReachable: !publicUrl.includes("localhost"),
        jwtSigning: jwtValid,
      },
      jwtError,
      installUrl: slug ? `https://github.com/apps/${slug}/installations/new` : null,
      setup: {
        webhookEvents: ["push", "installation", "installation_repositories"],
        permissions: ["Contents: read", "Metadata: read"],
      },
    };
  });

  app.get("/integrations/github-app/install-url", { preHandler: authenticate }, async (_request, reply) => {
    const slug = process.env.GITHUB_APP_SLUG;
    if (!slug) {
      return reply.code(503).send({
        error: "GITHUB_APP_SLUG is not configured",
        hint: "Set GITHUB_APP_SLUG to your GitHub App slug (from github.com/apps/<slug>)",
      });
    }
    return {
      installUrl: `https://github.com/apps/${slug}/installations/new`,
      appSlug: slug,
    };
  });
}