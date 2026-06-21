import { describe, expect, it } from "vitest";
import { parseInstallationEvent } from "./app-auth.js";

describe("parseInstallationEvent", () => {
  it("extracts installation metadata", () => {
    const parsed = parseInstallationEvent({
      action: "created",
      installation: { id: 42, account: { login: "acme" } },
      repositories: [{ name: "demo-app" }],
    });
    expect(parsed.installationId).toBe(42);
    expect(parsed.account).toBe("acme");
    expect(parsed.repositories).toEqual(["demo-app"]);
  });
});