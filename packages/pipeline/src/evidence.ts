import {
  advanceFinding,
  createId,
  createEvidenceFromFinding,
  createEvidenceFromSymbol,
  enrichEvidenceRecord,
  initialFindingLifecycle,
} from "@codetruth/core";
import {
  assertConfidenceLevel,
  confidenceMeetsMinimum,
  downgradeConfidence,
  inferConfidenceFromEvidence,
  isConfidenceLevel,
  minimumConfidenceForSeverity,
} from "@codetruth/core";
import type { EvidenceRecord, Finding, SnapshotRecord, SymbolRecord } from "@codetruth/core";

export { createEvidenceFromFinding, createEvidenceFromSymbol } from "@codetruth/core";

const REPOSITORY_PATH = "repository";

function normalizeRecord(
  record: EvidenceRecord,
  snapshot: SnapshotRecord,
  finding: Finding,
): EvidenceRecord {
  const rawSnippet =
    record.rawSnippet ??
    record.snippet ??
    `${finding.title}: ${finding.description}`.slice(0, 240);

  return enrichEvidenceRecord({
    snapshotHash: record.snapshotHash || snapshot.hash,
    filePath: record.filePath?.trim() || REPOSITORY_PATH,
    lineStart: record.lineStart,
    lineEnd: record.lineEnd,
    symbolId: record.symbolId,
    symbolName: record.symbolName,
    rawSnippet,
    snippet: (record.snippet ?? rawSnippet).slice(0, 500),
    extractionMethod: record.extractionMethod ?? "inference",
    confidenceAtExtraction:
      record.confidenceAtExtraction ??
      inferConfidenceFromEvidence([record]),
  });
}

function absenceEvidence(
  snapshot: SnapshotRecord,
  finding: Finding,
  filePath?: string,
): EvidenceRecord {
  return enrichEvidenceRecord({
    snapshotHash: snapshot.hash,
    filePath: filePath ?? REPOSITORY_PATH,
    extractionMethod: "inference",
    rawSnippet: `Absence signal: ${finding.title} — ${finding.description}`,
    snippet: `Absence signal: ${finding.title}`,
    confidenceAtExtraction: "Unknown",
  });
}

function attachSymbolEvidence(
  finding: Finding,
  snapshot: SnapshotRecord,
  symbols?: SymbolRecord[],
): EvidenceRecord[] {
  if (!symbols?.length) return [];

  const related = symbols.filter((symbol) => {
    const pathMatch = finding.gapCategory
      ? symbol.filePath.toLowerCase().includes(finding.gapCategory.split(" ")[0] ?? "")
      : false;
    const titleTokens = finding.title.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    const nameMatch = titleTokens.some((token) => symbol.name.toLowerCase().includes(token));
    return pathMatch || nameMatch;
  });

  if (!related.length) return [];
  return related.slice(0, 3).map((symbol) => createEvidenceFromSymbol(symbol, snapshot.hash));
}

/** Enforce mandatory evidence chain before Truth Council. */
export function enforceFindingEvidence(
  finding: Finding,
  snapshot: SnapshotRecord,
  symbols?: SymbolRecord[],
): Finding {
  const symbolEvidence = attachSymbolEvidence(finding, snapshot, symbols);
  const rawChain = finding.evidenceChain?.length
    ? finding.evidenceChain
    : finding.evidence?.length
      ? finding.evidence
      : symbolEvidence.length
        ? symbolEvidence
        : [absenceEvidence(snapshot, finding)];

  const mergedChain = [...rawChain, ...symbolEvidence];
  const evidenceChain = mergedChain.map((record) => normalizeRecord(record, snapshot, finding));
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

function applySeverityConfidenceGate(finding: Finding): Finding {
  const minimum = minimumConfidenceForSeverity(finding.severity);
  const isHighSeverity =
    finding.severity === "Critical blocker" || finding.severity === "High-risk flaw";

  if (!isHighSeverity) return finding;
  if (confidenceMeetsMinimum(finding.confidence, minimum)) return finding;

  return {
    ...finding,
    confidence: downgradeConfidence(finding.confidence, 1),
    flaggedForWeakEvidence: true,
    description: `${finding.description} [Flagged: ${finding.severity} below minimum confidence ${minimum}.]`,
  };
}

export function normalizeFindingsForCouncil(
  findings: Finding[],
  snapshot: SnapshotRecord,
  symbols?: SymbolRecord[],
): { findings: Finding[]; corrected: number; flagged: number } {
  let corrected = 0;
  let flagged = 0;

  const normalized = findings.map((finding) => {
    const before = JSON.stringify(finding.evidence ?? []);
    let next = enforceFindingEvidence(finding, snapshot, symbols);
    next = applySeverityConfidenceGate(next);

    if (JSON.stringify(next.evidenceChain) !== before || !finding.evidenceChain?.length) {
      corrected += 1;
    }
    if (next.flaggedForWeakEvidence) flagged += 1;
    return advanceFinding(
      { ...next, lifecycleState: next.lifecycleState ?? initialFindingLifecycle() },
      "EvidenceEnforced",
    );
  });

  return { findings: normalized, corrected, flagged };
}

export function degradedUnknownFinding(
  snapshot: SnapshotRecord,
  title: string,
  description: string,
): Finding {
  const placeholder: Finding = {
    id: createId("find"),
    domain: "code structure",
    severity: "Informational observation",
    confidence: "Unknown",
    title,
    description,
    evidence: [],
    evidenceChain: [],
  };
  const chain = [absenceEvidence(snapshot, placeholder)];
  return advanceFinding(
    {
      ...placeholder,
      evidence: chain,
      evidenceChain: chain,
      lifecycleState: initialFindingLifecycle(),
    },
    "EvidenceEnforced",
  );
}