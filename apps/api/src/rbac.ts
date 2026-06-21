import type { FastifyReply, FastifyRequest } from "fastify";
import { createId } from "@codetruth/core";
import type { AuditLogEntry, Permission, WorkspaceMember } from "@codetruth/core";
import { roleHasPermission } from "@codetruth/governance";
import { store } from "./context.js";

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireWorkspaceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  workspaceId: string,
  permission: Permission,
): Promise<WorkspaceMember | undefined> {
  if (!request.user) {
    reply.code(401).send({ error: "Unauthorized" });
    return undefined;
  }

  const member = await store.getMember(workspaceId, request.user.id);
  if (!member || !roleHasPermission(member.role, permission)) {
    reply.code(403).send({
      error: "Forbidden",
      message: `Role '${member?.role ?? "none"}' cannot perform '${permission}'`,
    });
    return undefined;
  }

  return member;
}

export async function recordAudit(input: {
  workspaceId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const entry: AuditLogEntry = {
    id: createId("audit"),
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    timestamp: new Date().toISOString(),
    metadata: input.metadata,
  };
  await store.appendAudit(entry);
}