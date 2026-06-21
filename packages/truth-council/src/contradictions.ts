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

export function buildScorecardFindingContradiction(
  bundle: CouncilEvidenceBundle,
): ContradictionRecord | null {
  const highRisk = bundle.findings.filter(isHighSeverity);
  if (bundle.scorecard.overall < 75 || !highRisk.length) return null;

  const sample = highRisk[0]!;
  const claimEvidence = sample.evidenceChain.slice(0, 3);

  return {
    id: createId("contradiction"),
    claim: `Scorecard indicates strong readiness (${bundle.scorecard.overall}/100)`,
    challenge: `${highRisk.length} high-severity finding(s) remain unresolved`,
    models: ["Planning Model", "Evaluation Layer"],
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
    positions: [
      {
        model: "Planning Model",
        stance: "supports",
        claim: `Maturity stage ${bundle.scorecard.maturityStage} with score ${bundle.scorecard.overall}`,
        confidence: "Strongly Inferred",
        evidenceRefs: ["scorecard"],
      },
      {
        model: "Security Model",
        stance: "challenges",
        claim: highRisk.map((f) => f.title).join("; "),
        confidence: sample.confidence,
        evidenceRefs: evidenceRefs(claimEvidence),
      },
    ],
  };
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

  return {
    id: createId("contradiction"),
    claim: `${finding.title} asserted at ${finding.confidence}`,
    challenge:
      "Evidence chain is inference-only or absent for a high-severity claim; scope should be weakened",
    models: [challenger, "Security Model"],
    severity: "unresolved",
    impactSeverity: finding.severity === "Critical blocker" ? "critical" : "high",
    subjectFindingId: finding.id,
    claimEvidence,
    challengeEvidence: challengeEvidence.length
      ? challengeEvidence
      : [
          {
            snapshotHash: claimEvidence[0]?.snapshotHash ?? "repository",
            filePath: claimEvidence[0]?.filePath ?? "repository",
            extractionMethod: "inference",
            snippet: "No AST, config, or line-anchored evidence cited",
          },
        ],
    disagreementPenalty: 0.55,
    resolution: "claim_downgraded",
    positions: [
      {
        model: "Evaluation Layer",
        stance: "supports",
        claim: finding.title,
        confidence: finding.confidence,
        evidenceRefs: evidenceRefs(claimEvidence),
      },
      {
        model: challenger,
        stance: "challenges",
        claim: "High-severity claim exceeds evidentiary support",
        confidence: "Weakly Inferred",
        evidenceRefs: evidenceRefs(challengeEvidence),
      },
    ],
  };
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

  const positions: CouncilModelPosition[] = [
    {
      model: targetModel,
      stance: "supports",
      claim: finding.title,
      confidence: finding.confidence,
      evidenceRefs: evidenceRefs(chain),
    },
    {
      model: challenger,
      stance: "challenges",
      claim: `${targetModel} overstates "${finding.title}" relative to cited evidence`,
      confidence: "Weakly Inferred",
      evidenceRefs: evidenceRefs(chain),
    },
  ];

  return {
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
    positions,
  };
}