import { inferConfidenceFromEvidence } from "@codetruth/core";
import type {
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilEvidenceBundle,
  CouncilPhaseResult,
  ModelAssessment,
} from "@codetruth/core";
import {
  buildCrossModelChallenge,
  buildOverconfidenceContradiction,
  buildScorecardFindingContradiction,
} from "./contradictions.js";
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
    const scoped = modelFindings(model, bundle.findings);
    const evidenceCited = scoped.flatMap((f) => f.evidenceChain).slice(0, 12);
    const bullets = scoped.length
      ? scoped.map(
          (f) => `${f.severity}: ${evidenceLine(f)} (${f.confidence}) — ${f.description.slice(0, 120)}`,
        )
      : [`No ${model.replace(" Model", "").toLowerCase()}-domain findings in scope.`];

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

  const assessments = {} as Record<CouncilModel, ModelAssessment>;
  for (const model of COUNCIL_MODELS) {
    const related = contradictions.filter((c) => c.models.includes(model));
    const challengeBullets = related.map(
      (c) => `Challenge: ${c.challenge} (refs: ${c.challengeEvidence?.[0]?.filePath ?? "evidence pool"})`,
    );
    const base = phase1[model];
    assessments[model] = {
      ...base,
      bullets: [...challengeBullets, ...base.bullets].slice(0, 12),
      confidence:
        related.length > 0 && base.confidence === "Confirmed"
          ? "Strongly Inferred"
          : base.confidence,
    };
  }

  return { assessments, contradictions };
}

export interface DeliberationResult {
  phases: CouncilPhaseResult[];
  modelNotes: Record<CouncilModel, string[]>;
  contradictionRegister: ContradictionRecord[];
  consensus: ConsensusTruthReport;
}

export function runHeuristicDeliberation(
  bundle: CouncilEvidenceBundle,
  llmPowered = false,
): DeliberationResult {
  const independent = runIndependentPhase(bundle);
  const crossReview = runCrossReviewPhase(bundle, independent);
  const consensus = synthesizeConsensus(
    bundle,
    independent,
    crossReview.contradictions,
    llmPowered,
  );

  const modelNotes = Object.fromEntries(
    COUNCIL_MODELS.map((model) => [model, crossReview.assessments[model].bullets]),
  ) as Record<CouncilModel, string[]>;

  const phases: CouncilPhaseResult[] = [
    {
      phase: "independent",
      modelAssessments: Object.fromEntries(
        COUNCIL_MODELS.map((m) => [m, independent[m].bullets]),
      ),
      structuredAssessments: Object.values(independent),
      contradictions: [],
      summary: "Independent first-pass assessments completed for all five model roles.",
    },
    {
      phase: "cross_review",
      modelAssessments: modelNotes,
      structuredAssessments: Object.values(crossReview.assessments),
      contradictions: crossReview.contradictions,
      summary: `${crossReview.contradictions.length} evidence-weighted challenge(s) logged; disagreements preserved.`,
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
  };
}