import { describe, expect, it } from "vitest";
import type { SnapshotRecord } from "@codetruth/core";
import { diffSnapshots } from "./diff.js";

function snap(id: string, files: Array<{ path: string; hash: string }>): SnapshotRecord {
  return {
    id,
    projectId: "project_test",
    hash: id,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    manifest: files.map((f) => ({ path: f.path, hash: f.hash, size: 10 })),
    stackProfile: {
      languages: [],
      frameworks: [],
      packageManagers: [],
      containerization: [],
      infrastructureAsCode: [],
      cicd: [],
      testFrameworks: [],
    },
    rootPath: `/tmp/${id}`,
  };
}

describe("diffSnapshots", () => {
  it("detects added, removed, and modified files", () => {
    const base = snap("snap_a", [
      { path: "a.ts", hash: "1" },
      { path: "b.ts", hash: "2" },
    ]);
    const target = snap("snap_b", [
      { path: "a.ts", hash: "1" },
      { path: "b.ts", hash: "3" },
      { path: "c.ts", hash: "4" },
    ]);

    const diff = diffSnapshots(base, target);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.path).toBe("c.ts");
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0]?.path).toBe("b.ts");
    expect(diff.unchanged).toBe(1);
    expect(diff.languageBreakdown?.length).toBeGreaterThan(0);
    expect(diff.driftScore).toBeDefined();
  });

  it("diffs symbols when provided", () => {
    const base = snap("snap_a", [{ path: "a.go", hash: "1" }]);
    const target = snap("snap_b", [{ path: "a.go", hash: "1" }]);
    const diff = diffSnapshots(base, target, {
      baseSymbols: [
        {
          id: "s1",
          name: "Old",
          kind: "function",
          filePath: "a.go",
          confidence: "Confirmed",
          evidence: [{ snapshotHash: "h", filePath: "a.go", extractionMethod: "AST" }],
          evidenceChain: [{ snapshotHash: "h", filePath: "a.go", extractionMethod: "AST" }],
        },
      ],
      targetSymbols: [
        {
          id: "s2",
          name: "New",
          kind: "function",
          filePath: "a.go",
          confidence: "Confirmed",
          evidence: [{ snapshotHash: "h", filePath: "a.go", extractionMethod: "AST" }],
          evidenceChain: [{ snapshotHash: "h", filePath: "a.go", extractionMethod: "AST" }],
        },
      ],
    });
    expect(diff.symbolChanges?.length).toBe(2);
  });
});