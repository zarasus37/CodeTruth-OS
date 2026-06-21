import type {
  Finding,
  FindingReview,
  QualityGatePolicy,
  QualityGateResult,
  SeverityLevel,
} from "@codetruth/core";

export const DEFAULT_QUALITY_GATE_POLICY: QualityGatePolicy = {
  blockSeverities: ["Critical blocker", "High-risk flaw"],
};

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  "Critical blocker": 0,
  "High-risk flaw": 1,
  "Medium-priority weakness": 2,
  "Low-priority debt": 3,
  "Informational observation": 4,
};

export function parseBlockSeverities(input: string | undefined): SeverityLevel[] {
  if (!input?.trim()) return DEFAULT_QUALITY_GATE_POLICY.blockSeverities;
  const allowed = new Set(Object.keys(SEVERITY_RANK));
  const parsed = input
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SeverityLevel => allowed.has(s));
  return parsed.length ? parsed : DEFAULT_QUALITY_GATE_POLICY.blockSeverities;
}

export function mergeQualityGatePolicy(
  projectPolicy?: QualityGatePolicy,
  override?: Partial<QualityGatePolicy>,
): QualityGatePolicy {
  return {
    blockSeverities:
      override?.blockSeverities ?? projectPolicy?.blockSeverities ?? DEFAULT_QUALITY_GATE_POLICY.blockSeverities,
    minOverallScore: override?.minOverallScore ?? projectPolicy?.minOverallScore,
  };
}

export function evaluateQualityGate(input: {
  findings: Finding[];
  reviews?: FindingReview[];
  overallScore?: number;
  policy?: QualityGatePolicy;
  analysisId?: string;
  snapshotId?: string;
}): QualityGateResult {
  const policy = input.policy ?? DEFAULT_QUALITY_GATE_POLICY;
  const reviewMap = new Map((input.reviews ?? []).map((r) => [r.findingId, r]));

  const blockedFindings = input.findings
    .filter((finding) => {
      const review = reviewMap.get(finding.id);
      if (review?.status === "accepted" || review?.status === "deferred") return false;
      return policy.blockSeverities.includes(finding.severity);
    })
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      domain: f.domain,
      description: f.description,
    }));

  const scoreFailed =
    policy.minOverallScore != null &&
    input.overallScore != null &&
    input.overallScore < policy.minOverallScore;

  const passed = blockedFindings.length === 0 && !scoreFailed;

  let summary: string;
  if (!input.analysisId) {
    summary = "No completed analysis available for quality gate";
  } else if (passed) {
    summary = `Quality gate passed (${input.overallScore ?? "n/a"}/100, 0 blocking findings)`;
  } else if (scoreFailed && blockedFindings.length) {
    summary = `Quality gate failed: score ${input.overallScore}/${policy.minOverallScore} and ${blockedFindings.length} blocking finding(s)`;
  } else if (scoreFailed) {
    summary = `Quality gate failed: score ${input.overallScore} below minimum ${policy.minOverallScore}`;
  } else {
    summary = `Quality gate failed: ${blockedFindings.length} blocking finding(s)`;
  }

  return {
    passed,
    analysisId: input.analysisId,
    snapshotId: input.snapshotId,
    overallScore: input.overallScore,
    blockedFindings,
    policy,
    summary,
  };
}