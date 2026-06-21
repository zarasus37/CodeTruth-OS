import { describe, expect, it } from "vitest";
import type { Finding, SnapshotRecord } from "@codetruth/core";
import type { SymbolRecord } from "@codetruth/core";
import {
  createEvidenceFromSymbol,
  enforceFindingEvidence,
  normalizeFindingsForCouncil,
} from "./evidence.js";

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

describe("createEvidenceFromSymbol", () => {
  it("maps symbol fields into enriched evidence records", () => {
    const symbol: SymbolRecord = {
      id: "sym_1",
      name: "login",
      kind: "function",
      filePath: "src/auth.ts",
      line: 8,
      lineEnd: 20,
      confidence: "Confirmed",
      evidence: [
        {
          snapshotHash: snapshot.hash,
          filePath: "src/auth.ts",
          lineStart: 8,
          extractionMethod: "AST",
          snippet: "function login()",
        },
      ],
      evidenceChain: [
        {
          snapshotHash: snapshot.hash,
          filePath: "src/auth.ts",
          lineStart: 8,
          extractionMethod: "AST",
          snippet: "function login()",
        },
      ],
    };
    const record = createEvidenceFromSymbol(symbol, snapshot.hash);
    expect(record.symbolName).toBe("login");
    expect(record.rawSnippet).toContain("login");
    expect(record.confidenceAtExtraction).toBe("Confirmed");
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

  it("flags Critical/High findings with weak evidence", () => {
    const { findings, flagged } = normalizeFindingsForCouncil(
      [
        bareFinding({
          severity: "Critical blocker",
          confidence: "Weakly Inferred",
          evidence: [
            {
              snapshotHash: snapshot.hash,
              filePath: "repository",
              extractionMethod: "inference",
            },
          ],
        }),
      ],
      snapshot,
    );
    expect(flagged).toBe(1);
    expect(findings[0]?.flaggedForWeakEvidence).toBe(true);
    expect(findings[0]?.evidenceChain[0]?.confidenceAtExtraction).toBeDefined();
  });
});