import { describe, expect, it } from "vitest";
import type { Workspace } from "@codetruth/core";
import {
  assertConsumerOAuthAllowed,
  assertDataResidencyCompliance,
  DataResidencyError,
  SsoPolicyError,
  workspacesEnforcingSsoForEmail,
} from "./policy.js";

const baseWorkspace = (overrides: Partial<Workspace>): Workspace => ({
  id: "ws_1",
  name: "Acme",
  createdAt: new Date().toISOString(),
  createdBy: "user_1",
  ...overrides,
});

describe("sovereign policy", () => {
  it("flags SSO enforcement for matching email domains", () => {
    const workspaces = [
      baseWorkspace({
        settings: {
          sso: {
            enabled: true,
            provider: "entra",
            enforceDomainSso: true,
            allowedEmailDomains: ["acme.com"],
          },
        },
      }),
    ];

    expect(workspacesEnforcingSsoForEmail(workspaces, "dev@acme.com")).toHaveLength(1);
    expect(() => assertConsumerOAuthAllowed("dev@acme.com", workspaces)).toThrow(SsoPolicyError);
    expect(() => assertConsumerOAuthAllowed("dev@gmail.com", workspaces)).not.toThrow();
  });

  it("blocks sovereign workspace on non-sovereign deployment when enforced", () => {
    const prev = process.env.ENFORCE_DATA_RESIDENCY;
    const prevRegion = process.env.DEPLOYMENT_REGION;
    process.env.ENFORCE_DATA_RESIDENCY = "true";
    process.env.DEPLOYMENT_REGION = "us";

    const workspace = baseWorkspace({ settings: { dataResidency: "eu" } });
    expect(() => assertDataResidencyCompliance(workspace)).toThrow(DataResidencyError);

    process.env.ENFORCE_DATA_RESIDENCY = prev;
    process.env.DEPLOYMENT_REGION = prevRegion;
  });
});