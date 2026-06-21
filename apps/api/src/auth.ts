import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createId } from "@codetruth/core";
import type { User } from "@codetruth/core";
import { store } from "./context.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

export function createApiToken(): string {
  return randomBytes(24).toString("hex");
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing Bearer token" });
  }

  const user = await store.getUserByToken(header.slice(7));
  if (!user) {
    return reply.code(401).send({ error: "Invalid token" });
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