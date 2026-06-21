import { applyDisagreementPenalty, confidenceRank } from "@codetruth/core";
import type {
  ConfidenceLevel,
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilEvidenceBundle,
  ModelAssessment,
  WeightedClaim,
} from "@codetruth/core";
import { COUNCIL_MODELS, type CouncilModel } from "./models.js";

function findingHasUnresolvedContradiction(
  findingId: string,
  register: ContradictionRecord[],
): boolean {
  return register.some((c) => c.subjectFindingId === findingId && c.severity === "unresolved");
}

export function buildWeightedClaims(
  bundle: CouncilEvidenceBundle,
  phase1: Record<CouncilModel, ModelAssessment>,
  contradictionRegister: ContradictionRecord[],
): WeightedClaim[] {
  const claims: WeightedClaim[] = [];

  for (const finding of bundle.findings) {
    const supporting = COUNCIL_MODELS.filter((model) =>
      phase1[model].bullets.some((b) => b.includes(finding.title)),
    );
    const dissenting = contradictionRegister
      .filter((c) => c.subjectFindingId === finding.id)
      .flatMap((c) => c.models)
      .filter((m) => !supporting.includes(m as CouncilModel));

    const uniqueDissent = [...new Set(dissenting)];
    const base = findingHasUnresolvedContradiction(finding.id, contradictionRegister)
      ? "Weakly Inferred"
      : finding.confidence;
    const { confidence, penalty } = applyDisagreementPenalty(
      base,
      uniqueDissent.length,
      COUNCIL_MODELS.length,
    );

    claims.push({
      claim: finding.title,
      confidence,
      supportingModels: supporting.length ? supporting : ["Evaluation Layer"],
      dissentingModels: uniqueDissent,
      disagreementPenalty: Math.max(
        penalty,
        contradictionRegister.find((c) => c.subjectFindingId === finding.id)?.disagreementPenalty ??
          0,
      ),
    });
  }

  if (bundle.scorecard.overall > 0) {
    const scoreDissent = contradictionRegister.filter((c) => c.claim.includes("readiness")).length;
    const { confidence, penalty } = applyDisagreementPenalty(
      "Strongly Inferred",
      scoreDissent,
      COUNCIL_MODELS.length,
    );
    claims.push({
      claim: `Overall maturity: ${bundle.scorecard.maturityStage} (${bundle.scorecard.overall}/100)`,
      confidence,
      supportingModels: ["Planning Model"],
      dissentingModels: scoreDissent ? ["Security Model"] : [],
      disagreementPenalty: penalty,
    });
  }

  return claims;
}

export function synthesizeConsensus(
  bundle: CouncilEvidenceBundle,
  phase1: Record<CouncilModel, ModelAssessment>,
  contradictionRegister: ContradictionRecord[],
  llmPowered: boolean,
): ConsensusTruthReport {
  const weightedClaims = buildWeightedClaims(bundle, phase1, contradictionRegister);
  const unresolved = contradictionRegister.filter((c) => c.severity === "unresolved");

  const confirmedClaims = weightedClaims
    .filter((c) => c.confidence === "Confirmed" && c.dissentingModels.length === 0)
    .map((c) => c.claim);

  const inferredClaims = weightedClaims
    .filter(
      (c) =>
        c.confidence !== "Confirmed" &&
        c.confidence !== "Contradicted" &&
        c.confidence !== "Unknown",
    )
    .map((c) => `${c.claim} (${c.confidence})`);

  const unknowns = [
    ...bundle.scorecard.domains
      .filter((d) => d.confidence === "Unknown" || d.confidence === "Weakly Inferred")
      .map((d) => `${d.domain} requires additional evidence`),
    ...bundle.findings
      .filter((f) => f.confidence === "Unknown")
      .map((f) => `${f.title} — insufficient evidence`),
  ];

  const serviceClaim =
    bundle.architecture.services.length > 0
      ? `${bundle.architecture.services.length} service boundary(ies) identified`
      : null;
  if (serviceClaim && !confirmedClaims.includes(serviceClaim)) {
    confirmedClaims.unshift(serviceClaim);
  }

  const synthesisConfidence: ConfidenceLevel = weightedClaims.length
    ? weightedClaims.reduce((lowest, claim) =>
        confidenceRank(claim.confidence) < confidenceRank(lowest) ? claim.confidence : lowest,
      weightedClaims[0]!.confidence)
    : "Unknown";

  const modeLabel = llmPowered ? "LLM Truth Council" : "Heuristic Truth Council";

  return {
    summary: `${modeLabel} completed 3-phase deliberation across ${COUNCIL_MODELS.length} models. ${bundle.findings.length} findings reviewed; ${unresolved.length} unresolved contradiction(s) preserved. Project classified as ${bundle.scorecard.maturityStage} (${bundle.scorecard.overall}/100).`,
    confirmedClaims,
    inferredClaims,
    contradictions: unresolved.map((c) => `${c.claim} ↔ ${c.challenge}`),
    unknowns,
    weightedClaims,
    synthesisConfidence,
  };
}