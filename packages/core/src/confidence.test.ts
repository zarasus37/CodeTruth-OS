import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_LEVELS,
  applyDisagreementPenalty,
  assertConfidenceLevel,
  confidenceMeetsMinimum,
  downgradeConfidence,
  inferConfidenceFromEvidence,
  isConfidenceLevel,
} from "./confidence.js";

describe("confidence taxonomy", () => {
  it("defines five ordered tiers", () => {
    expect(CONFIDENCE_LEVELS).toEqual([
      "Confirmed",
      "Strongly Inferred",
      "Weakly Inferred",
      "Unknown",
      "Contradicted",
    ]);
  });

  it("validates confidence levels", () => {
    expect(isConfidenceLevel("Confirmed")).toBe(true);
    expect(isConfidenceLevel("invalid")).toBe(false);
    expect(assertConfidenceLevel("Unknown")).toBe("Unknown");
    expect(() => assertConfidenceLevel("guess")).toThrow(/Invalid confidence level/);
  });

  it("ranks confidence for minimum checks", () => {
    expect(confidenceMeetsMinimum("Confirmed", "Weakly Inferred")).toBe(true);
    expect(confidenceMeetsMinimum("Unknown", "Confirmed")).toBe(false);
  });

  it("infers confidence from evidence strength", () => {
    expect(inferConfidenceFromEvidence([])).toBe("Unknown");
    expect(
      inferConfidenceFromEvidence([
        {
          snapshotHash: "h",
          filePath: "src/a.ts",
          lineStart: 10,
          extractionMethod: "AST",
        },
      ]),
    ).toBe("Confirmed");
    expect(
      inferConfidenceFromEvidence([
        {
          snapshotHash: "h",
          filePath: "package.json",
          snippet: "scripts.test",
          extractionMethod: "config_parse",
        },
      ]),
    ).toBe("Confirmed");
    expect(
      inferConfidenceFromEvidence([
        {
          snapshotHash: "h",
          filePath: "repo",
          extractionMethod: "inference",
        },
      ]),
    ).toBe("Weakly Inferred");
  });

  it("downgrades confidence and applies disagreement penalty", () => {
    expect(downgradeConfidence("Confirmed", 1)).toBe("Strongly Inferred");
    expect(downgradeConfidence("Confirmed", 2)).toBe("Weakly Inferred");
    const penalized = applyDisagreementPenalty("Confirmed", 3, 5);
    expect(penalized.penalty).toBe(0.6);
    expect(penalized.confidence).toBe("Weakly Inferred");
  });
});