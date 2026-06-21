import { describe, expect, it } from "vitest";
import type { Finding, SnapshotRecord } from "@codetruth/core";
import { enforceFindingEvidence, normalizeFindingsForCouncil } from "./evidence.js";

const snapshot: SnapshotRecord = {
  id: "snap_1",
  projectId: "proj_1",
  hash: "hash_abc",
  createdAt: new Date().toISOString(),
  fileCount: 2,
  manifest: [
    { path: "src/api.ts", hash: "h1", size: 100 },
    { path: "package.json", hash: "h2", size: 50 },
  ],
  stackProfile: {
    languages: ["typescript"],
    frameworks: [],
    packageManagers: [],
    containerization: [],
    infrastructureAsCode: [],
    cicd: [],
    testFrameworks: [],
  },
  rootPath: "/tmp/project",
};

function bareFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "find_1",
    domain: "security posture",
    severity: "High-risk flaw",
    confidence: "Confirmed",
    title: "Missing auth middleware",
    description: "Routes lack authentication.",
    evidence: [],
    evidenceChain: [],
    ...overrides,
  };
}

describe("enforceFindingEvidence", () => {
  it("synthesizes evidence chain when missing", () => {
    const next = enforceFindingEvidence(bareFinding(), snapshot);
    expect(next.evidenceChain).toHaveLength(1);
    const first = next.evidenceChain[0]!;
    expect(first.filePath).toBe("repository");
    expect(first.snapshotHash).toBe(snapshot.hash);
    expect(first.extractionMethod).toBe("inference");
  });

  it("downgrades overconfident findings without strong evidence", () => {
    const next = enforceFindingEvidence(
      bareFinding({
        confidence: "Confirmed",
        evidence: [
          {
            snapshotHash: snapshot.hash,
            filePath: "repository",
            extractionMethod: "inference",
          },
        ],
      }),
      snapshot,
    );
    expect(next.confidence).toBe("Weakly Inferred");
  });

  it("preserves confirmed confidence with AST line evidence", () => {
    const chain = [
      {
        snapshotHash: snapshot.hash,
        filePath: "src/api.ts",
        lineStart: 12,
        extractionMethod: "AST" as const,
        snippet: "router.get('/admin')",
      },
    ];
    const next = enforceFindingEvidence(
      bareFinding({ evidence: chain, evidenceChain: chain, confidence: "Confirmed" }),
      snapshot,
    );
    expect(next.confidence).toBe("Confirmed");
    expect(next.evidenceChain[0]!.lineStart).toBe(12);
  });
});

describe("normalizeFindingsForCouncil", () => {
  it("normalizes all findings and counts corrections", () => {
    const { findings, corrected } = normalizeFindingsForCouncil(
      [bareFinding(), bareFinding({ id: "find_2", title: "No CI pipeline" })],
      snapshot,
    );
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.evidenceChain.length >= 1)).toBe(true);
    expect(corrected).toBe(2);
  });
});