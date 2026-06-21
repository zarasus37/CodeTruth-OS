import { describe, expect, it } from "vitest";
import { applyCouncilFallbackToFindings } from "./fallback.js";

describe("applyCouncilFallbackToFindings", () => {
  it("downgrades findings referenced in contradiction register", () => {
    const findings = [
      {
        id: "f1",
        domain: "security posture" as const,
        severity: "High-risk flaw" as const,
        confidence: "Confirmed" as const,
        title: "Missing auth",
        description: "No auth.",
        evidence: [],
        evidenceChain: [],
      },
    ];

    const adjusted = applyCouncilFallbackToFindings(findings, "LLM timeout", [
      {
        id: "c1",
        claim: "claim",
        challenge: "challenge",
        models: ["Security Model"],
        severity: "unresolved",
        subjectFindingId: "f1",
      },
    ]);

    expect(adjusted[0]?.confidence).toBe("Weakly Inferred");
    expect(adjusted[0]?.description).toContain("Council fallback");
  });
});