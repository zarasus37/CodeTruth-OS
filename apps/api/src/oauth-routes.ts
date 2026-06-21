import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import {
  githubAuthorizeUrl,
  googleAuthorizeUrl,
  handleGitHubCallback,
  handleGoogleCallback,
  isDevEmailLoginEnabled,
  isGitHubOAuthEnabled,
  isGoogleOAuthEnabled,
  issueAuthResponse,
  parseSessionCookie,
  signOAuthState,
  verifyOAuthState,
} from "./oauth.js";
import { store } from "./context.js";


export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/providers", async () => ({
    github: isGitHubOAuthEnabled(),
    google: isGoogleOAuthEnabled(),
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
        return reply.code(500).send({
          error: error instanceof Error ? error.message : "GitHub OAuth failed",
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
        return reply.code(500).send({
          error: error instanceof Error ? error.message : "Google OAuth failed",
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