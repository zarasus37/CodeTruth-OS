import type { Permission, WorkspaceRole } from "@codetruth/core";

const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: [
    "workspace:manage",
    "workspace:invite",
    "project:create",
    "analysis:trigger",
    "report:view",
    "finding:annotate",
    "report:approve",
    "task:export",
  ],
  admin: [
    "workspace:manage",
    "workspace:invite",
    "project:create",
    "analysis:trigger",
    "report:view",
    "finding:annotate",
    "report:approve",
    "task:export",
  ],
  engineer: [
    "project:create",
    "analysis:trigger",
    "report:view",
    "finding:annotate",
    "task:export",
  ],
  reviewer: ["report:view", "finding:annotate"],
  viewer: ["report:view"],
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function getRolePermissions(role: WorkspaceRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  engineer: "Engineer",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export const ASSIGNABLE_ROLES: WorkspaceRole[] = [
  "admin",
  "engineer",
  "reviewer",
  "viewer",
];