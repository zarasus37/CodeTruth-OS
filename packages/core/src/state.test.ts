import { describe, expect, it } from "vitest";
import type { Finding } from "./types.js";
import {
  advanceFinding,
  advanceFindings,
  canTransitionFinding,
  transitionFindingState,
} from "./state.js";

function sampleFinding(state?: Finding["lifecycleState"]): Finding {
  return {
    id: "f1",
    domain: "security posture",
    severity: "High-risk flaw",
    confidence: "Confirmed",
    title: "Auth gap",
    description: "desc",
    evidence: [],
    evidenceChain: [],
    lifecycleState: state,
  };
}

describe("Finding lifecycle state machine", () => {
  it("allows the canonical forward path", () => {
    expect(canTransitionFinding(undefined, "Created")).toBe(true);
    expect(canTransitionFinding("Created", "EvidenceEnforced")).toBe(true);
    expect(canTransitionFinding("EvidenceEnforced", "CouncilReviewed")).toBe(true);
    expect(canTransitionFinding("CouncilReviewed", "Finalized")).toBe(true);
  });

  it("rejects skipping stages", () => {
    expect(canTransitionFinding("Created", "CouncilReviewed")).toBe(false);
    expect(canTransitionFinding("Created", "Finalized")).toBe(false);
  });

  it("advances findings through the pipeline order", () => {
    let finding = sampleFinding("Created");
    finding = advanceFinding(finding, "EvidenceEnforced");
    finding = advanceFinding(finding, "CouncilReviewed");
    finding = advanceFinding(finding, "Finalized");
    expect(finding.lifecycleState).toBe("Finalized");
  });

  it("defaults undefined state to Created before transitioning", () => {
    const next = advanceFinding(sampleFinding(), "EvidenceEnforced");
    expect(next.lifecycleState).toBe("EvidenceEnforced");
  });

  it("throws on invalid transitions", () => {
    expect(() => transitionFindingState("Created", "Finalized")).toThrow(
      /Invalid finding lifecycle/,
    );
  });

  it("batch-advances finding collections", () => {
    const updated = advanceFindings([sampleFinding("EvidenceEnforced")], "CouncilReviewed");
    expect(updated[0]?.lifecycleState).toBe("CouncilReviewed");
  });
});