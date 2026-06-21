import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createId } from "@codetruth/core";
import type { User } from "@codetruth/core";
import { parseSessionCookie, resolveUserFromSession } from "./oauth.js";
import { store } from "./context.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export function createApiToken(): string {
  return randomBytes(24).toString("hex");
}

async function resolveAuthenticatedUser(request: FastifyRequest): Promise<User | undefined> {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    const sessionUser = await resolveUserFromSession(token);
    if (sessionUser) return sessionUser;
    return store.getUserByToken(token);
  }

  const sessionToken = parseSessionCookie(request);
  if (sessionToken) {
    return resolveUserFromSession(sessionToken);
  }

  return undefined;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return reply.code(401).send({ error: "Authentication required" });
  }

  request.user = user;
}

export async function findOrCreateUser(
  email: string,
  displayName: string,
): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await store.getUserByEmail(normalizedEmail);
  if (existing) return existing;

  const user: User = {
    id: createId("user"),
    email: normalizedEmail,
    displayName: displayName.trim() || normalizedEmail.split("@")[0] || "User",
    apiToken: createApiToken(),
    createdAt: new Date().toISOString(),
  };
  await store.saveUser(user);
  return user;
}

export async function refreshUserToken(currentToken: string): Promise<User | undefined> {
  const user = await store.getUserByToken(currentToken);
  if (!user) return undefined;
  user.apiToken = createApiToken();
  await store.saveUser(user);
  return user;
}