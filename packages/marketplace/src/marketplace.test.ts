import { describe, expect, it } from "vitest";
import type { SnapshotRecord } from "@codetruth/core";
import { listMarketplaceAnalyzers, mergeMarketplaceFindings, runMarketplaceAnalyzers } from "./index.js";

describe("marketplace analyzers", () => {
  it("lists phase-4 analyzer catalog", () => {
    const catalog = listMarketplaceAnalyzers();
    expect(catalog).toHaveLength(3);
    expect(catalog.map((a) => a.id)).toEqual(["solidity-audit", "defi-risk", "agent-safety"]);
  });

  it("runs enabled analyzers and merges supplemental findings", () => {
    const snapshot: SnapshotRecord = {
      id: "snap_test",
      projectId: "proj_test",
      hash: "hash_test",
      createdAt: new Date().toISOString(),
      fileCount: 1,
      manifest: [{ path: "contracts/Vault.sol", hash: "h1", size: 100 }],
      stackProfile: {
        languages: ["solidity"],
        frameworks: [],
        packageManagers: [],
        containerization: [],
        infrastructureAsCode: [],
        cicd: [],
        testFrameworks: [],
      },
      rootPath: process.cwd(),
    };

    const runs = runMarketplaceAnalyzers(snapshot, ["solidity-audit"]);
    expect(runs).toHaveLength(1);
    const merged = mergeMarketplaceFindings([], runs);
    expect(Array.isArray(merged)).toBe(true);
  });
});