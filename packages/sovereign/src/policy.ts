import type { DataResidencyRegion, SsoProvider, Workspace, WorkspaceSettings } from "@codetruth/core";

export class DataResidencyError extends Error {
  constructor(
    message: string,
    readonly code = "data_residency_violation",
  ) {
    super(message);
    this.name = "DataResidencyError";
  }
}

export class SsoPolicyError extends Error {
  constructor(
    message: string,
    readonly code = "sso_policy_violation",
  ) {
    super(message);
    this.name = "SsoPolicyError";
  }
}

export function deploymentRegion(): DataResidencyRegion {
  const raw = process.env.DEPLOYMENT_REGION?.toLowerCase();
  if (raw === "eu" || raw === "apac" || raw === "sovereign" || raw === "us") return raw;
  return process.env.NODE_ENV === "production" ? "us" : "us";
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function resolveWorkspaceResidency(settings?: WorkspaceSettings): DataResidencyRegion {
  return settings?.dataResidency ?? defaultDataResidencyFromEnv();
}

function defaultDataResidencyFromEnv(): DataResidencyRegion {
  const raw = process.env.DEFAULT_DATA_RESIDENCY?.toLowerCase();
  if (raw === "eu" || raw === "apac" || raw === "sovereign" || raw === "us") return raw;
  return "us";
}

/** Ensures this deployment may host the workspace's declared residency tier. */
export function assertDataResidencyCompliance(workspace: Workspace): void {
  const required = resolveWorkspaceResidency(workspace.settings);
  const deployment = deploymentRegion();

  if (required === deployment) return;

  if (required === "sovereign" && deployment !== "sovereign") {
    throw new DataResidencyError(
      `Workspace requires sovereign residency; deployment is ${deployment}`,
    );
  }

  if (process.env.ENFORCE_DATA_RESIDENCY === "true") {
    throw new DataResidencyError(
      `Workspace data residency (${required}) does not match deployment region (${deployment})`,
    );
  }
}

export function residencyPolicyStatus(workspace: Workspace): {
  workspaceRegion: DataResidencyRegion;
  deploymentRegion: DataResidencyRegion;
  compliant: boolean;
  enforced: boolean;
} {
  const workspaceRegion = resolveWorkspaceResidency(workspace.settings);
  const deploy = deploymentRegion();
  const enforced = process.env.ENFORCE_DATA_RESIDENCY === "true";
  const compliant =
    workspaceRegion === deploy ||
    (workspaceRegion !== "sovereign" && !enforced) ||
    (workspaceRegion === "sovereign" && deploy === "sovereign");

  return { workspaceRegion, deploymentRegion: deploy, compliant, enforced };
}

function domainAllowed(domain: string, allowed?: string[]): boolean {
  if (!allowed?.length) return true;
  return allowed.map((d) => d.toLowerCase()).includes(domain);
}

export function workspacesEnforcingSsoForEmail(
  workspaces: Workspace[],
  email: string,
): Workspace[] {
  const domain = emailDomain(email);
  if (!domain) return [];

  return workspaces.filter((workspace) => {
    const sso = workspace.settings?.sso;
    if (!sso?.enabled || !sso.enforceDomainSso) return false;
    return domainAllowed(domain, sso.allowedEmailDomains);
  });
}

/** Block GitHub/Google/dev-email when a workspace enforces SSO for this domain. */
export function assertConsumerOAuthAllowed(email: string, workspaces: Workspace[]): void {
  const enforcing = workspacesEnforcingSsoForEmail(workspaces, email);
  if (!enforcing.length) return;

  throw new SsoPolicyError(
    `Email domain @${emailDomain(email)} requires SSO (${enforcing[0]!.settings?.sso?.provider ?? "entra"})`,
    "sso_required",
  );
}

export function assertSsoProviderEmailAllowed(
  email: string,
  provider: SsoProvider,
  workspaces: Workspace[],
  workspaceId?: string,
): void {
  const domain = emailDomain(email);
  if (!domain) throw new SsoPolicyError("SSO account missing email domain");

  const scoped = workspaceId
    ? workspaces.filter((w) => w.id === workspaceId)
    : workspaces.filter((w) => w.settings?.sso?.enabled);

  for (const workspace of scoped) {
    const sso = workspace.settings?.sso;
    if (!sso?.enabled || sso.provider !== provider) continue;
    if (!domainAllowed(domain, sso.allowedEmailDomains)) {
      throw new SsoPolicyError(
        `Email @${domain} is not allowed for workspace SSO (${workspace.name})`,
        "sso_domain_not_allowed",
      );
    }
  }
}

export function auditResidencyMetadata(workspace: Workspace): Record<string, unknown> {
  const status = residencyPolicyStatus(workspace);
  return {
    dataResidency: status.workspaceRegion,
    deploymentRegion: status.deploymentRegion,
    residencyCompliant: status.compliant,
  };
}