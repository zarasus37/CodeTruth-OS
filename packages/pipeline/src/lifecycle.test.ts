import { describe, expect, it } from "vitest";
import type { Finding } from "@codetruth/core";
import {
  advanceFindingsGuarded,
  assertFindingsAtLeast,
  previewLifecycleTransition,
} from "./lifecycle.js";

function finding(state?: Finding["lifecycleState"]): Finding {
  return {
    id: "f1",
    domain: "security posture",
    severity: "High-risk flaw",
    confidence: "Confirmed",
    title: "Gap",
    description: "desc",
    evidence: [],
    evidenceChain: [],
    lifecycleState: state,
  };
}

describe("pipeline lifecycle guards", () => {
  it("previews allowed and blocked transitions", () => {
    expect(previewLifecycleTransition("Created", "EvidenceEnforced").allowed).toBe(true);
    expect(previewLifecycleTransition("Created", "Finalized").allowed).toBe(false);
  });

  it("advances findings with guarded transitions", () => {
    const { findings, audits } = advanceFindingsGuarded(
      [finding("EvidenceEnforced")],
      "CouncilReviewed",
    );
    expect(findings[0]?.lifecycleState).toBe("CouncilReviewed");
    expect(audits[0]?.allowed).toBe(true);
  });

  it("throws when skipping lifecycle stages", () => {
    expect(() => advanceFindingsGuarded([finding("Created")], "Finalized")).toThrow(
      /Invalid finding lifecycle/,
    );
  });

  it("asserts minimum lifecycle before council", () => {
    expect(() => assertFindingsAtLeast([finding("Created")], "EvidenceEnforced")).toThrow(
      /below required EvidenceEnforced/,
    );
    expect(() =>
      assertFindingsAtLeast([finding("EvidenceEnforced")], "EvidenceEnforced"),
    ).not.toThrow();
  });
});