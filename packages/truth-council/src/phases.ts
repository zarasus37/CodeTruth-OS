import { inferConfidenceFromEvidence } from "@codetruth/core";
import type {
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilEvidenceBundle,
  CouncilPhaseResult,
  CrossReviewDowngradeAudit,
  ModelAssessment,
} from "@codetruth/core";
import {
  buildCrossModelChallenge,
  buildOverconfidenceContradiction,
  buildScorecardFindingContradiction,
} from "./contradictions.js";
import { applyCrossReviewDowngrades } from "./downgrades.js";
import { buildModelContext } from "./model-context.js";
import { COUNCIL_MODELS, modelFindings, type CouncilModel } from "./models.js";
import { synthesizeConsensus } from "./synthesis.js";

function evidenceLine(finding: { title: string; evidenceChain: ModelAssessment["evidenceCited"] }): string {
  const top = finding.evidenceChain[0];
  if (!top) return finding.title;
  const loc = top.lineStart != null ? `:${top.lineStart}` : "";
  return `${finding.title} [${top.filePath}${loc}]`;
}

export function runIndependentPhase(
  bundle: CouncilEvidenceBundle,
): Record<CouncilModel, ModelAssessment> {
  const assessments = {} as Record<CouncilModel, ModelAssessment>;

  for (const model of COUNCIL_MODELS) {
    const injectedContext = buildModelContext(bundle, model);
    const scoped = modelFindings(model, bundle.findings);
    const evidenceCited = scoped.flatMap((f) => f.evidenceChain).slice(0, 12);
    const contextHints = injectedContext.sourceSnippets
      .slice(0, 3)
      .map((s) => `${s.filePath}${s.lineStart != null ? `:${s.lineStart}` : ""}`);
    const bullets = scoped.length
      ? scoped.map(
          (f) => `${f.severity}: ${evidenceLine(f)} (${f.confidence}) — ${f.description.slice(0, 120)}`,
        )
      : [`No ${model.replace(" Model", "").toLowerCase()}-domain findings in scope.`];

    if (contextHints.length) {
      bullets.unshift(`Context: ${contextHints.join(", ")} (${injectedContext.architectureNodes.length} arch nodes)`);
    }

    const confidence =
      scoped.length === 0
        ? "Unknown"
        : scoped.every((f) => f.confidence === "Confirmed")
          ? "Confirmed"
          : scoped.some((f) => f.confidence === "Confirmed" || f.confidence === "Strongly Inferred")
            ? "Strongly Inferred"
            : inferConfidenceFromEvidence(evidenceCited);

    assessments[model] = {
      model,
      bullets: bullets.slice(0, 10),
      confidence,
      findingsReviewed: scoped.length,
      evidenceCited,
      injectedContext,
    };
  }

  return assessments;
}

export function runCrossReviewPhase(
  bundle: CouncilEvidenceBundle,
  phase1: Record<CouncilModel, ModelAssessment>,
): {
  assessments: Record<CouncilModel, ModelAssessment>;
  contradictions: ContradictionRecord[];
  downgradeAudit: CrossReviewDowngradeAudit[];
} {
  const contradictions: ContradictionRecord[] = [];
  const seen = new Set<string>();

  const pushUnique = (record: ContradictionRecord | null) => {
    if (!record) return;
    const key = `${record.subjectFindingId ?? ""}:${record.claim}:${record.challenge}`;
    if (seen.has(key)) return;
    seen.add(key);
    contradictions.push(record);
  };

  pushUnique(buildScorecardFindingContradiction(bundle));

  for (const finding of bundle.findings) {
    pushUnique(buildOverconfidenceContradiction(finding, "Security Model"));
  }

  for (const challenger of COUNCIL_MODELS) {
    for (const target of COUNCIL_MODELS) {
      if (challenger === target) continue;
      const targetFindings = modelFindings(target, bundle.findings);
      for (const finding of targetFindings) {
        if (finding.confidence === "Confirmed" && !finding.evidenceChain.length) continue;
        pushUnique(buildCrossModelChallenge(challenger, target, finding));
      }
    }
  }

  const withChallengeBullets = {} as Record<CouncilModel, ModelAssessment>;
  for (const model of COUNCIL_MODELS) {
    const related = contradictions.filter(
      (c) => c.models.includes(model) || c.modelA === model || c.modelB === model,
    );
    const challengeBullets = related.map((c) => {
      const ref = c.evidenceCitedB?.[0]?.filePath ?? c.challengeEvidence?.[0]?.filePath ?? "evidence pool";
      const resolution = c.suggestedResolution ? ` → ${c.suggestedResolution}` : "";
      return `Challenge (${c.modelB} vs ${c.modelA}): ${c.challenge} [${ref}]${resolution}`;
    });
    const base = phase1[model];
    withChallengeBullets[model] = {
      ...base,
      bullets: [...challengeBullets, ...base.bullets].slice(0, 12),
    };
  }

  const { assessments, audit } = applyCrossReviewDowngrades(withChallengeBullets, contradictions);

  return { assessments, contradictions, downgradeAudit: audit };
}

export interface DeliberationResult {
  phases: CouncilPhaseResult[];
  modelNotes: Record<CouncilModel, string[]>;
  contradictionRegister: ContradictionRecord[];
  consensus: ConsensusTruthReport;
  downgradeAudit?: CrossReviewDowngradeAudit[];
}

export function runHeuristicDeliberation(
  bundle: CouncilEvidenceBundle,
  llmPowered = false,
): DeliberationResult {
  const independent = runIndependentPhase(bundle);
  const crossReview = runCrossReviewPhase(bundle, independent);
  const consensus = synthesizeConsensus(
    bundle,
    crossReview.assessments,
    crossReview.contradictions,
    llmPowered,
  );

  const modelNotes = Object.fromEntries(
    COUNCIL_MODELS.map((model) => [model, crossReview.assessments[model].bullets]),
  ) as Record<CouncilModel, string[]>;

  const downgradeSummary =
    crossReview.downgradeAudit.length > 0
      ? ` ${crossReview.downgradeAudit.length} model confidence downgrade(s) applied per cross-review rules.`
      : "";

  const phases: CouncilPhaseResult[] = [
    {
      phase: "independent",
      modelAssessments: Object.fromEntries(
        COUNCIL_MODELS.map((m) => [m, independent[m].bullets]),
      ),
      structuredAssessments: Object.values(independent),
      contradictions: [],
      summary: "Independent first-pass assessments completed with per-model evidence context.",
    },
    {
      phase: "cross_review",
      modelAssessments: modelNotes,
      structuredAssessments: Object.values(crossReview.assessments),
      contradictions: crossReview.contradictions,
      summary: `${crossReview.contradictions.length} evidence-weighted challenge(s) logged; disagreements preserved.${downgradeSummary}`,
    },
    {
      phase: "consensus",
      modelAssessments: modelNotes,
      structuredAssessments: Object.values(crossReview.assessments),
      contradictions: crossReview.contradictions.filter((c) => c.severity === "unresolved"),
      summary: `Consensus synthesis produced ${consensus.weightedClaims?.length ?? 0} confidence-weighted claim(s).`,
    },
  ];

  return {
    phases,
    modelNotes,
    contradictionRegister: crossReview.contradictions,
    consensus,
    downgradeAudit: crossReview.downgradeAudit,
  };
}