import { downgradeConfidence } from "@codetruth/core";
import type { ContradictionRecord, Finding } from "@codetruth/core";

export function applyCouncilFallbackToFindings(
  findings: Finding[],
  reason: string,
  contradictionRegister: ContradictionRecord[],
): Finding[] {
  const affectedIds = new Set(
    contradictionRegister
      .filter((c) => c.severity === "unresolved" && c.subjectFindingId)
      .map((c) => c.subjectFindingId!),
  );

  return findings.map((finding) => {
    const inRegister = affectedIds.has(finding.id);
    const overconfident =
      finding.confidence === "Confirmed" || finding.confidence === "Strongly Inferred";
    if (!inRegister && !overconfident) return finding;

    const steps = inRegister ? 2 : 1;
    const nextConfidence = downgradeConfidence(finding.confidence, steps);

    return {
      ...finding,
      confidence: nextConfidence,
      description: inRegister
        ? `${finding.description} [Council fallback: ${reason}; confidence reduced due to unresolved contradiction.]`
        : `${finding.description} [Council fallback: ${reason}; heuristic review applied.]`,
    };
  });
}