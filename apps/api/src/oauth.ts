import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createId } from "@codetruth/core";
import type { User } from "@codetruth/core";
import { createApiToken } from "./auth.js";
import { store } from "./context.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? "dev-session-secret-change-me";
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:4310";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

type OAuthProvider = "github" | "google" | "entra" | "okta";

export function signOAuthState(provider: OAuthProvider): string {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  const payload = `${provider}:${nonce}:${expiresAt}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string, provider: OAuthProvider): boolean {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [prov, , expiresAt, sig] = decoded.split(":");
    if (prov !== provider) return false;
    if (Date.now() > Number(expiresAt)) return false;
    const payload = decoded.slice(0, decoded.lastIndexOf(":"));
    const expected = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
    const a = Buffer.from(sig ?? "");
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isGitHubOAuthEnabled(): boolean {
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
}

export function isGoogleOAuthEnabled(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function isEntraOAuthEnabled(): boolean {
  return Boolean(
    process.env.ENTRA_TENANT_ID &&
      process.env.ENTRA_CLIENT_ID &&
      process.env.ENTRA_CLIENT_SECRET,
  );
}

export function isOktaOAuthEnabled(): boolean {
  return Boolean(
    process.env.OKTA_ISSUER && process.env.OKTA_CLIENT_ID && process.env.OKTA_CLIENT_SECRET,
  );
}

function entraTenantId(): string {
  return process.env.ENTRA_TENANT_ID!;
}

function oktaIssuer(): string {
  return process.env.OKTA_ISSUER!.replace(/\/$/, "");
}

export function isDevEmailLoginEnabled(): boolean {
  if (process.env.AUTH_DEV_EMAIL_LOGIN === "false") return false;
  if (process.env.NODE_ENV === "production" && !isGitHubOAuthEnabled() && !isGoogleOAuthEnabled()) {
    return false;
  }
  return process.env.AUTH_DEV_EMAIL_LOGIN === "true" || process.env.NODE_ENV !== "production";
}

export function githubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
    redirect_uri: `${appUrl()}/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export function entraAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID!,
    redirect_uri: `${appUrl()}/auth/entra/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    response_mode: "query",
  });
  return `https://login.microsoftonline.com/${entraTenantId()}/oauth2/v2.0/authorize?${params}`;
}

export function oktaAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.OKTA_CLIENT_ID!,
    redirect_uri: `${appUrl()}/auth/okta/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return `${oktaIssuer()}/v1/authorize?${params}`;
}

export function googleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: `${appUrl()}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const session = {
    id: createId("sess"),
    userId,
    token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  await store.saveSession(session);
  return session;
}

export async function issueAuthResponse(user: User, reply: FastifyReply) {
  const session = await createSession(user.id);
  reply.setCookie("codetruth_session", session.token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    maxAge: SESSION_TTL_MS / 1000,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      authProvider: user.authProvider,
      createdAt: user.createdAt,
    },
    token: user.apiToken,
    sessionToken: session.token,
  };
}

export function parseSessionCookie(request: FastifyRequest): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [key, value] = part.trim().split("=");
    if (key === "codetruth_session" && value) return decodeURIComponent(value);
  }
  return undefined;
}

export async function resolveUserFromSession(sessionToken: string): Promise<User | undefined> {
  const session = await store.getSessionByToken(sessionToken);
  if (!session) return undefined;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await store.deleteSession(sessionToken);
    return undefined;
  }
  return store.getUser(session.userId);
}

interface GitHubTokenResponse {
  access_token: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function handleGitHubCallback(code: string): Promise<User> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${appUrl()}/auth/github/callback`,
    }),
  });

  const tokenPayload = (await tokenRes.json()) as GitHubTokenResponse;
  if (!tokenPayload.access_token) {
    throw new Error("GitHub token exchange failed");
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CodeTruth-OS",
    },
  });
  const ghUser = (await userRes.json()) as GitHubUser;

  let email: string | undefined = ghUser.email ?? undefined;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "CodeTruth-OS",
      },
    });
    const emails = (await emailRes.json()) as Array<{ email: string; primary: boolean }>;
    email = emails.find((entry) => entry.primary)?.email ?? emails[0]?.email;
  }
  if (!email) throw new Error("GitHub account has no public email");

  const githubId = String(ghUser.id);
  let user = await store.getUserByGithubId(githubId);
  if (!user) {
    const byEmail = await store.getUserByEmail(email);
    if (byEmail) {
      user = {
        ...byEmail,
        githubId,
        authProvider: "github",
        avatarUrl: ghUser.avatar_url,
        displayName: ghUser.name ?? ghUser.login,
      };
    } else {
      user = {
        id: createId("user"),
        email: email.trim().toLowerCase(),
        displayName: ghUser.name ?? ghUser.login,
        apiToken: createApiToken(),
        createdAt: new Date().toISOString(),
        authProvider: "github",
        githubId,
        avatarUrl: ghUser.avatar_url,
      };
    }
    await store.saveUser(user);
    const { trackEvent } = await import("./telemetry-service.js");
    await trackEvent("user.signed_up", {
      userId: user.id,
      properties: { authProvider: "github" },
    });
  }

  const { trackEvent } = await import("./telemetry-service.js");
  await trackEvent("user.signed_in", { userId: user.id, properties: { authProvider: "github" } });
  return user;
}

export async function handleGoogleCallback(code: string): Promise<User> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: `${appUrl()}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokenPayload = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenPayload.access_token) {
    throw new Error("Google token exchange failed");
  }

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const googleUser = (await userRes.json()) as GoogleUserInfo;
  if (!googleUser.email) throw new Error("Google account missing email");

  const googleId = googleUser.sub;
  let user = await store.getUserByGoogleId(googleId);
  if (!user) {
    const byEmail = await store.getUserByEmail(googleUser.email);
    if (byEmail) {
      user = {
        ...byEmail,
        googleId,
        authProvider: "google",
        avatarUrl: googleUser.picture,
        displayName: googleUser.name ?? byEmail.displayName,
      };
    } else {
      user = {
        id: createId("user"),
        email: googleUser.email.trim().toLowerCase(),
        displayName: googleUser.name ?? googleUser.email.split("@")[0] ?? "User",
        apiToken: createApiToken(),
        createdAt: new Date().toISOString(),
        authProvider: "google",
        googleId,
        avatarUrl: googleUser.picture,
      };
    }
    await store.saveUser(user);
    const { trackEvent } = await import("./telemetry-service.js");
    await trackEvent("user.signed_up", {
      userId: user.id,
      properties: { authProvider: "google" },
    });
  }

  const { trackEvent } = await import("./telemetry-service.js");
  await trackEvent("user.signed_in", { userId: user.id, properties: { authProvider: "google" } });
  return user;
}

interface OidcTokenResponse {
  access_token?: string;
  id_token?: string;
}

interface OidcUserInfo {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

async function upsertOidcUser(
  provider: "entra" | "okta",
  subjectId: string,
  email: string,
  displayName: string,
  avatarUrl?: string,
): Promise<User> {
  const lookup =
    provider === "entra"
      ? store.getUserByEntraId.bind(store)
      : store.getUserByOktaId.bind(store);

  let user = await lookup(subjectId);
  if (!user) {
    const byEmail = await store.getUserByEmail(email);
    if (byEmail) {
      user = {
        ...byEmail,
        authProvider: provider,
        avatarUrl: avatarUrl ?? byEmail.avatarUrl,
        displayName,
        ...(provider === "entra" ? { entraId: subjectId } : { oktaId: subjectId }),
      };
    } else {
      user = {
        id: createId("user"),
        email: email.trim().toLowerCase(),
        displayName,
        apiToken: createApiToken(),
        createdAt: new Date().toISOString(),
        authProvider: provider,
        avatarUrl,
        ...(provider === "entra" ? { entraId: subjectId } : { oktaId: subjectId }),
      };
      await store.saveUser(user);
      const { trackEvent } = await import("./telemetry-service.js");
      await trackEvent("user.signed_up", {
        userId: user.id,
        properties: { authProvider: provider },
      });
    }
    await store.saveUser(user);
  }

  const { trackEvent } = await import("./telemetry-service.js");
  await trackEvent("user.signed_in", { userId: user.id, properties: { authProvider: provider } });
  return user;
}

export async function handleEntraCallback(code: string): Promise<User> {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${entraTenantId()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.ENTRA_CLIENT_ID!,
        client_secret: process.env.ENTRA_CLIENT_SECRET!,
        code,
        redirect_uri: `${appUrl()}/auth/entra/callback`,
        grant_type: "authorization_code",
        scope: "openid email profile",
      }),
    },
  );

  const tokenPayload = (await tokenRes.json()) as OidcTokenResponse;
  if (!tokenPayload.access_token) {
    throw new Error("Entra token exchange failed");
  }

  const userRes = await fetch("https://graph.microsoft.com/oidc/userinfo", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const profile = (await userRes.json()) as OidcUserInfo;
  const email = profile.email ?? profile.preferred_username;
  if (!email) throw new Error("Entra account missing email");

  return upsertOidcUser(
    "entra",
    profile.sub,
    email,
    profile.name ?? email.split("@")[0] ?? "User",
    profile.picture,
  );
}

export async function handleOktaCallback(code: string): Promise<User> {
  const tokenRes = await fetch(`${oktaIssuer()}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OKTA_CLIENT_ID!,
      client_secret: process.env.OKTA_CLIENT_SECRET!,
      code,
      redirect_uri: `${appUrl()}/auth/okta/callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokenPayload = (await tokenRes.json()) as OidcTokenResponse;
  if (!tokenPayload.access_token) {
    throw new Error("Okta token exchange failed");
  }

  const userRes = await fetch(`${oktaIssuer()}/v1/userinfo`, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const profile = (await userRes.json()) as OidcUserInfo;
  const email = profile.email ?? profile.preferred_username;
  if (!email) throw new Error("Okta account missing email");

  return upsertOidcUser(
    "okta",
    profile.sub,
    email,
    profile.name ?? email.split("@")[0] ?? "User",
    profile.picture,
  );
}