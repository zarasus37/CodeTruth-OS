import { createId } from "@codetruth/core";
import type {
  ContradictionImpactSeverity,
  ContradictionRecord,
  CouncilEvidenceBundle,
  CouncilFindingContext,
  CouncilModelPosition,
  EvidenceRecord,
} from "@codetruth/core";
import type { CouncilModel } from "./models.js";

export function isWeakEvidence(chain: EvidenceRecord[] | undefined): boolean {
  return (
    !chain?.length ||
    chain.every((e) => e.extractionMethod === "inference" && !e.lineStart && !e.symbolId)
  );
}

export function isHighSeverity(finding: CouncilFindingContext): boolean {
  return finding.severity === "Critical blocker" || finding.severity === "High-risk flaw";
}

function evidenceRefs(chain: EvidenceRecord[]): string[] {
  return chain.map((e) => {
    const loc = e.lineStart != null ? `:${e.lineStart}` : "";
    return `${e.filePath}${loc}`;
  });
}

function suggestResolution(
  record: Pick<
    ContradictionRecord,
    "resolution" | "impactSeverity" | "severity" | "subjectFindingId"
  >,
): string {
  if (record.resolution === "claim_downgraded") {
    return "Downgrade claim confidence to match evidentiary support before planner sequencing.";
  }
  if (record.resolution === "challenge_rejected") {
    return "Retain original claim; document rebuttal evidence in the contradiction register.";
  }
  if (record.impactSeverity === "critical" || record.impactSeverity === "high") {
    return "Escalate for human review; withhold Confirmed status until line-anchored or AST evidence is added.";
  }
  if (record.severity === "unresolved" && record.subjectFindingId) {
    return "Preserve disagreement; route finding to stabilize track with explicit evidence-gathering tasks.";
  }
  return "Preserve disagreement; note in planner backlog without blocking lower-priority work.";
}

type ContradictionDraft = Omit<
  ContradictionRecord,
  "modelA" | "modelB" | "positionA" | "positionB" | "evidenceCitedA" | "evidenceCitedB" | "suggestedResolution"
> &
  Partial<
    Pick<
      ContradictionRecord,
      | "modelA"
      | "modelB"
      | "positionA"
      | "positionB"
      | "evidenceCitedA"
      | "evidenceCitedB"
      | "suggestedResolution"
    >
  >;

export function finalizeContradiction(draft: ContradictionDraft): ContradictionRecord {
  const positions = draft.positions ?? [];
  const supporter = positions.find((p) => p.stance === "supports") ?? positions[0];
  const challenger = positions.find((p) => p.stance === "challenges") ?? positions[1];

  const modelA = draft.modelA ?? supporter?.model ?? draft.models[0] ?? "Unknown";
  const modelB = draft.modelB ?? challenger?.model ?? draft.models[1] ?? "Truth Council";
  const positionA = draft.positionA ?? supporter;
  const positionB = draft.positionB ?? challenger;
  const evidenceCitedA = draft.evidenceCitedA ?? draft.claimEvidence ?? [];
  const evidenceCitedB = draft.evidenceCitedB ?? draft.challengeEvidence ?? [];

  return {
    ...draft,
    modelA,
    modelB,
    positionA,
    positionB,
    evidenceCitedA,
    evidenceCitedB,
    suggestedResolution: draft.suggestedResolution ?? suggestResolution(draft),
    claimEvidence: draft.claimEvidence ?? evidenceCitedA,
    challengeEvidence: draft.challengeEvidence ?? evidenceCitedB,
    positions: positions.length ? positions : [positionA, positionB].filter(Boolean) as CouncilModelPosition[],
  };
}

export function buildScorecardFindingContradiction(
  bundle: CouncilEvidenceBundle,
): ContradictionRecord | null {
  const highRisk = bundle.findings.filter(isHighSeverity);
  if (bundle.scorecard.overall < 75 || !highRisk.length) return null;

  const sample = highRisk[0]!;
  const claimEvidence = sample.evidenceChain.slice(0, 3);
  const positionA: CouncilModelPosition = {
    model: "Planning Model",
    stance: "supports",
    claim: `Maturity stage ${bundle.scorecard.maturityStage} with score ${bundle.scorecard.overall}`,
    confidence: "Strongly Inferred",
    evidenceRefs: ["scorecard"],
  };
  const positionB: CouncilModelPosition = {
    model: "Security Model",
    stance: "challenges",
    claim: highRisk.map((f) => f.title).join("; "),
    confidence: sample.confidence,
    evidenceRefs: evidenceRefs(claimEvidence),
  };

  return finalizeContradiction({
    id: createId("contradiction"),
    claim: `Scorecard indicates strong readiness (${bundle.scorecard.overall}/100)`,
    challenge: `${highRisk.length} high-severity finding(s) remain unresolved`,
    models: ["Planning Model", "Security Model"],
    severity: "unresolved",
    impactSeverity: "high",
    subjectFindingId: sample.id,
    claimEvidence: [
      {
        snapshotHash: claimEvidence[0]?.snapshotHash ?? "scorecard",
        filePath: "scorecard",
        extractionMethod: "inference",
        snippet: `Overall ${bundle.scorecard.overall}, stage ${bundle.scorecard.maturityStage}`,
      },
    ],
    challengeEvidence: claimEvidence,
    disagreementPenalty: 0.4,
    resolution: "preserved_disagreement",
    modelA: "Planning Model",
    modelB: "Security Model",
    positionA,
    positionB,
    positions: [positionA, positionB],
  });
}

export function buildOverconfidenceContradiction(
  finding: CouncilFindingContext,
  challenger: CouncilModel,
): ContradictionRecord | null {
  const chain = finding.evidenceChain;
  const overconfident =
    finding.confidence === "Confirmed" || finding.confidence === "Strongly Inferred";
  if (!isWeakEvidence(chain) || !isHighSeverity(finding) || !overconfident) return null;

  const claimEvidence = chain.slice(0, 3);
  const challengeEvidence = chain.filter((e) => e.extractionMethod !== "inference").slice(0, 2);
  const resolvedChallengeEvidence = challengeEvidence.length
    ? challengeEvidence
    : [
        {
          snapshotHash: claimEvidence[0]?.snapshotHash ?? "repository",
          filePath: claimEvidence[0]?.filePath ?? "repository",
          extractionMethod: "inference" as const,
          snippet: "No AST, config, or line-anchored evidence cited",
        },
      ];

  const positionA: CouncilModelPosition = {
    model: "Evaluation Layer",
    stance: "supports",
    claim: finding.title,
    confidence: finding.confidence,
    evidenceRefs: evidenceRefs(claimEvidence),
  };
  const positionB: CouncilModelPosition = {
    model: challenger,
    stance: "challenges",
    claim: "High-severity claim exceeds evidentiary support",
    confidence: "Weakly Inferred",
    evidenceRefs: evidenceRefs(resolvedChallengeEvidence),
  };

  return finalizeContradiction({
    id: createId("contradiction"),
    claim: `${finding.title} asserted at ${finding.confidence}`,
    challenge:
      "Evidence chain is inference-only or absent for a high-severity claim; scope should be weakened",
    models: [challenger, "Evaluation Layer"],
    severity: "unresolved",
    impactSeverity: finding.severity === "Critical blocker" ? "critical" : "high",
    subjectFindingId: finding.id,
    claimEvidence,
    challengeEvidence: resolvedChallengeEvidence,
    disagreementPenalty: 0.55,
    resolution: "claim_downgraded",
    modelA: "Evaluation Layer",
    modelB: challenger,
    positionA,
    positionB,
    positions: [positionA, positionB],
  });
}

export function buildCrossModelChallenge(
  challenger: CouncilModel,
  targetModel: CouncilModel,
  finding: CouncilFindingContext,
): ContradictionRecord | null {
  if (challenger === targetModel) return null;
  if (!isHighSeverity(finding) && finding.confidence === "Confirmed") return null;

  const chain = finding.evidenceChain.slice(0, 3);
  if (!isWeakEvidence(chain) && finding.confidence !== "Confirmed") return null;

  const impact: ContradictionImpactSeverity =
    finding.severity === "Critical blocker" ? "critical" : "high";

  const positionA: CouncilModelPosition = {
    model: targetModel,
    stance: "supports",
    claim: finding.title,
    confidence: finding.confidence,
    evidenceRefs: evidenceRefs(chain),
  };
  const positionB: CouncilModelPosition = {
    model: challenger,
    stance: "challenges",
    claim: `${targetModel} overstates "${finding.title}" relative to cited evidence`,
    confidence: "Weakly Inferred",
    evidenceRefs: evidenceRefs(chain),
  };

  return finalizeContradiction({
    id: createId("contradiction"),
    claim: `${targetModel}: ${finding.title}`,
    challenge: `${challenger} disputes confidence (${finding.confidence}) — evidence does not support full claim`,
    models: [challenger, targetModel],
    severity: "unresolved",
    impactSeverity: impact,
    subjectFindingId: finding.id,
    claimEvidence: chain,
    challengeEvidence: chain,
    disagreementPenalty: 0.35,
    resolution: "preserved_disagreement",
    modelA: targetModel,
    modelB: challenger,
    positionA,
    positionB,
    positions: [positionA, positionB],
  });
}