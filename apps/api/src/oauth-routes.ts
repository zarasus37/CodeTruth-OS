import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import {
  entraAuthorizeUrl,
  githubAuthorizeUrl,
  googleAuthorizeUrl,
  handleEntraCallback,
  handleGitHubCallback,
  handleGoogleCallback,
  handleOktaCallback,
  SsoPolicyError,
  isDevEmailLoginEnabled,
  isEntraOAuthEnabled,
  isGitHubOAuthEnabled,
  isGoogleOAuthEnabled,
  isOktaOAuthEnabled,
  issueAuthResponse,
  oktaAuthorizeUrl,
  parseSessionCookie,
  parseOAuthState,
  signOAuthState,
  verifyOAuthState,
} from "./oauth.js";
import { store } from "./context.js";


export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/providers", async () => ({
    github: isGitHubOAuthEnabled(),
    google: isGoogleOAuthEnabled(),
    entra: isEntraOAuthEnabled(),
    okta: isOktaOAuthEnabled(),
    devEmail: isDevEmailLoginEnabled(),
  }));

  app.get("/auth/github", async (_request, reply) => {
    if (!isGitHubOAuthEnabled()) {
      return reply.code(503).send({ error: "GitHub OAuth is not configured" });
    }
    const state = signOAuthState("github");
    return reply.redirect(githubAuthorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/auth/github/callback",
    async (request, reply) => {
      const code = request.query.code;
      const state = request.query.state;
      if (!code || !state || !verifyOAuthState(state, "github")) {
        return reply.code(400).send({ error: "Invalid GitHub OAuth callback" });
      }

      try {
        const user = await handleGitHubCallback(code);
        const payload = await issueAuthResponse(user, reply);
        return reply.redirect(`/?auth=success&token=${encodeURIComponent(payload.token)}`);
      } catch (error) {
        const status = error instanceof SsoPolicyError ? 403 : 500;
        return reply.code(status).send({
          error: error instanceof Error ? error.message : "GitHub OAuth failed",
          code: error instanceof SsoPolicyError ? error.code : undefined,
        });
      }
    },
  );

  app.get("/auth/google", async (_request, reply) => {
    if (!isGoogleOAuthEnabled()) {
      return reply.code(503).send({ error: "Google OAuth is not configured" });
    }
    const state = signOAuthState("google");
    return reply.redirect(googleAuthorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/auth/google/callback",
    async (request, reply) => {
      const code = request.query.code;
      const state = request.query.state;
      if (!code || !state || !verifyOAuthState(state, "google")) {
        return reply.code(400).send({ error: "Invalid Google OAuth callback" });
      }

      try {
        const user = await handleGoogleCallback(code);
        const payload = await issueAuthResponse(user, reply);
        return reply.redirect(`/?auth=success&token=${encodeURIComponent(payload.token)}`);
      } catch (error) {
        const status = error instanceof SsoPolicyError ? 403 : 500;
        return reply.code(status).send({
          error: error instanceof Error ? error.message : "Google OAuth failed",
          code: error instanceof SsoPolicyError ? error.code : undefined,
        });
      }
    },
  );

  app.get("/auth/entra", async (_request, reply) => {
    if (!isEntraOAuthEnabled()) {
      return reply.code(503).send({ error: "Entra SSO is not configured" });
    }
    const state = signOAuthState("entra");
    return reply.redirect(entraAuthorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/auth/entra/callback",
    async (request, reply) => {
      const code = request.query.code;
      const state = request.query.state;
      const parsed = state ? parseOAuthState(state, "entra") : undefined;
      if (!code || !state || !parsed) {
        return reply.code(400).send({ error: "Invalid Entra OAuth callback" });
      }

      try {
        const user = await handleEntraCallback(code, parsed.workspaceId);
        const payload = await issueAuthResponse(user, reply);
        return reply.redirect(`/?auth=success&token=${encodeURIComponent(payload.token)}`);
      } catch (error) {
        const status = error instanceof SsoPolicyError ? 403 : 500;
        return reply.code(status).send({
          error: error instanceof Error ? error.message : "Entra OAuth failed",
          code: error instanceof SsoPolicyError ? error.code : undefined,
        });
      }
    },
  );

  app.get("/auth/okta", async (_request, reply) => {
    if (!isOktaOAuthEnabled()) {
      return reply.code(503).send({ error: "Okta SSO is not configured" });
    }
    const state = signOAuthState("okta");
    return reply.redirect(oktaAuthorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/auth/okta/callback",
    async (request, reply) => {
      const code = request.query.code;
      const state = request.query.state;
      const parsed = state ? parseOAuthState(state, "okta") : undefined;
      if (!code || !state || !parsed) {
        return reply.code(400).send({ error: "Invalid Okta OAuth callback" });
      }

      try {
        const user = await handleOktaCallback(code, parsed.workspaceId);
        const payload = await issueAuthResponse(user, reply);
        return reply.redirect(`/?auth=success&token=${encodeURIComponent(payload.token)}`);
      } catch (error) {
        const status = error instanceof SsoPolicyError ? 403 : 500;
        return reply.code(status).send({
          error: error instanceof Error ? error.message : "Okta OAuth failed",
          code: error instanceof SsoPolicyError ? error.code : undefined,
        });
      }
    },
  );

  app.post("/auth/logout", { preHandler: authenticate }, async (request, reply) => {
    const sessionToken = parseSessionCookie(request);
    if (sessionToken) {
      await store.deleteSession(sessionToken);
    }
    reply.clearCookie("codetruth_session", { path: "/" });
    return { ok: true };
  });
}