import { createId } from "@codetruth/core";
import {
  assertConfidenceLevel,
  confidenceMeetsMinimum,
  inferConfidenceFromEvidence,
  isConfidenceLevel,
} from "@codetruth/core";
import type { EvidenceRecord, Finding, SnapshotRecord } from "@codetruth/core";

const REPOSITORY_PATH = "repository";

function normalizeRecord(
  record: EvidenceRecord,
  snapshot: SnapshotRecord,
  findingTitle: string,
): EvidenceRecord {
  return {
    snapshotHash: record.snapshotHash || snapshot.hash,
    filePath: record.filePath?.trim() || REPOSITORY_PATH,
    lineStart: record.lineStart,
    lineEnd: record.lineEnd,
    symbolId: record.symbolId,
    snippet: record.snippet?.slice(0, 500) ?? findingTitle.slice(0, 240),
    extractionMethod: record.extractionMethod ?? "inference",
  };
}

function absenceEvidence(snapshot: SnapshotRecord, title: string, filePath?: string): EvidenceRecord {
  return {
    snapshotHash: snapshot.hash,
    filePath: filePath ?? REPOSITORY_PATH,
    extractionMethod: "inference",
    snippet: `Absence signal: ${title}`,
  };
}

/** Enforce mandatory evidence chain before Truth Council. */
export function enforceFindingEvidence(finding: Finding, snapshot: SnapshotRecord): Finding {
  const rawChain = finding.evidenceChain?.length
    ? finding.evidenceChain
    : finding.evidence?.length
      ? finding.evidence
      : [absenceEvidence(snapshot, finding.title)];

  const evidenceChain = rawChain.map((record) => normalizeRecord(record, snapshot, finding.title));
  const confidence = isConfidenceLevel(finding.confidence)
    ? assertConfidenceLevel(finding.confidence)
    : inferConfidenceFromEvidence(evidenceChain);

  const inferred = inferConfidenceFromEvidence(evidenceChain);
  let reconciledConfidence = finding.contradicted ? "Contradicted" : confidence;
  if (
    reconciledConfidence === "Confirmed" &&
    !confidenceMeetsMinimum(inferred, "Confirmed")
  ) {
    reconciledConfidence = inferred;
  }

  return {
    ...finding,
    evidence: evidenceChain,
    evidenceChain,
    confidence: reconciledConfidence,
  };
}

export function normalizeFindingsForCouncil(
  findings: Finding[],
  snapshot: SnapshotRecord,
): { findings: Finding[]; corrected: number } {
  let corrected = 0;

  const normalized = findings.map((finding) => {
    const before = JSON.stringify(finding.evidence ?? []);
    const next = enforceFindingEvidence(finding, snapshot);
    if (JSON.stringify(next.evidenceChain) !== before || !finding.evidenceChain?.length) {
      corrected += 1;
    }
    return next;
  });

  return { findings: normalized, corrected };
}

export function degradedUnknownFinding(
  snapshot: SnapshotRecord,
  title: string,
  description: string,
): Finding {
  const chain = [absenceEvidence(snapshot, title)];
  return {
    id: createId("find"),
    domain: "code structure",
    severity: "Informational observation",
    confidence: "Unknown",
    title,
    description,
    evidence: chain,
    evidenceChain: chain,
  };
}