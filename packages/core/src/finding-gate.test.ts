import { describe, expect, it } from "vitest";
import {
  deriveConfidenceFromEvidenceChain,
  gateFindingConfidenceAtSource,
} from "./finding-gate.js";
import { hasAnchoredEvidence } from "./evidence.js";

describe("hasAnchoredEvidence", () => {
  it("detects AST line anchors", () => {
    expect(
      hasAnchoredEvidence([
        {
          snapshotHash: "h",
          filePath: "src/a.ts",
          lineStart: 4,
          extractionMethod: "AST",
        },
      ]),
    ).toBe(true);
  });

  it("rejects repository-level inference", () => {
    expect(
      hasAnchoredEvidence([
        {
          snapshotHash: "h",
          filePath: "repository",
          extractionMethod: "inference",
          rawSnippet: "Repository scan (12 files): no CI detected",
        },
      ]),
    ).toBe(false);
  });

  it("accepts config_parse for a concrete artifact path", () => {
    expect(
      hasAnchoredEvidence([
        {
          snapshotHash: "h",
          filePath: ".env.example",
          extractionMethod: "config_parse",
          rawSnippet: "Artifact check: .env.example",
        },
      ]),
    ).toBe(true);
  });
});

describe("gateFindingConfidenceAtSource", () => {
  it("derives confidence from evidence instead of optimistic defaults", () => {
    const confidence = deriveConfidenceFromEvidenceChain([
      {
        snapshotHash: "h",
        filePath: "repository",
        extractionMethod: "inference",
        rawSnippet: "Repository scan (4 files): no CI",
      },
    ]);
    expect(confidence).toBe("Weakly Inferred");
  });

  it("flags high-severity findings without anchored evidence", () => {
    const gated = gateFindingConfidenceAtSource({
      severity: "High-risk flaw",
      confidence: "Strongly Inferred",
      description: "No CI workflow detected.",
      evidenceChain: [
        {
          snapshotHash: "h",
          filePath: "repository",
          extractionMethod: "inference",
          rawSnippet: "Repository scan (8 files): no CI",
        },
      ],
    });

    expect(gated.confidence).toBe("Unknown");
    expect(gated.flaggedForWeakEvidence).toBe(true);
    expect(gated.description).toContain("below minimum confidence");
  });

  it("preserves confidence for high-severity findings with symbol anchors", () => {
    const gated = gateFindingConfidenceAtSource({
      severity: "High-risk flaw",
      confidence: "Confirmed",
      description: "Auth surface missing.",
      evidenceChain: [
        {
          snapshotHash: "h",
          filePath: "src/api.ts",
          lineStart: 12,
          symbolId: "sym_1",
          extractionMethod: "AST",
          rawSnippet: "router.get('/admin')",
        },
      ],
    });

    expect(gated.confidence).toBe("Confirmed");
    expect(gated.flaggedForWeakEvidence).toBeUndefined();
  });
});