import {
  confidenceMeetsMinimum,
  downgradeConfidence,
  inferConfidenceFromEvidence,
  mergeConfidence,
  minimumConfidenceForSeverity,
} from "./confidence.js";
import { hasAnchoredEvidence } from "./evidence.js";
import type { ConfidenceLevel, EvidenceRecord, Finding, SeverityLevel } from "./types.js";

const REPOSITORY_PATH = "repository";

function isHighSeverity(severity: SeverityLevel): boolean {
  return severity === "Critical blocker" || severity === "High-risk flaw";
}

/** Derive confidence from evidence; never exceed what the chain can support. */
export function deriveConfidenceFromEvidenceChain(
  evidenceChain: EvidenceRecord[],
  stated?: ConfidenceLevel,
): ConfidenceLevel {
  const inferred = inferConfidenceFromEvidence(evidenceChain);
  if (!stated) return inferred;
  return mergeConfidence(stated, inferred);
}

/**
 * Gate finding confidence at evaluation (or pipeline) source.
 * High-severity claims require anchored evidence; severity minimums trigger downgrade + flag.
 */
export function gateFindingConfidenceAtSource(
  finding: Pick<Finding, "severity" | "confidence" | "evidenceChain" | "description" | "flaggedForWeakEvidence">,
): Pick<Finding, "confidence" | "flaggedForWeakEvidence" | "description"> {
  const chain = finding.evidenceChain ?? [];
  let confidence = deriveConfidenceFromEvidenceChain(chain, finding.confidence);

  if (isHighSeverity(finding.severity) && !hasAnchoredEvidence(chain)) {
    confidence = mergeConfidence(confidence, "Weakly Inferred");
  }

  const minimum = minimumConfidenceForSeverity(finding.severity);
  let flaggedForWeakEvidence = finding.flaggedForWeakEvidence;
  let description = finding.description;

  if (!confidenceMeetsMinimum(confidence, minimum)) {
    confidence = downgradeConfidence(confidence, 1);
    if (confidence === "Contradicted") confidence = "Unknown";
    flaggedForWeakEvidence = true;
    const suffix = `[Flagged: ${finding.severity} below minimum confidence ${minimum}.]`;
    if (!description.includes(suffix)) {
      description = `${description} ${suffix}`;
    }
  }

  return { confidence, flaggedForWeakEvidence, description };
}