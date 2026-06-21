import {
  advanceFinding,
  createId,
  createAbsenceEvidence,
  createEvidenceFromSymbol,
  enrichEvidenceRecord,
  hasRichSnippet,
  inferBestConfidenceFromEvidence,
  inferConfidenceFromEvidence,
  initialFindingLifecycle,
  isSubstantiveEvidence,
} from "@codetruth/core";
import {
  assertConfidenceLevel,
  confidenceMeetsMinimum,
  downgradeConfidence,
  isConfidenceLevel,
  minimumConfidenceForSeverity,
} from "@codetruth/core";
import type { EvidenceRecord, Finding, SnapshotRecord, SymbolRecord } from "@codetruth/core";

export {
  createEvidenceFromFinding,
  createEvidenceFromSymbol,
} from "@codetruth/core";

const REPOSITORY_PATH = "repository";

function primaryFilePath(finding: Finding): string | undefined {
  const chain = finding.evidenceChain?.length ? finding.evidenceChain : finding.evidence;
  const path = chain?.[0]?.filePath;
  return path && path !== REPOSITORY_PATH ? path : undefined;
}

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
    ...record,
    snapshotHash: record.snapshotHash || snapshot.hash,
    filePath: record.filePath?.trim() || REPOSITORY_PATH,
    rawSnippet,
    snippet: (record.snippet ?? rawSnippet).slice(0, 500),
    extractionMethod: record.extractionMethod ?? "inference",
    confidenceAtExtraction:
      record.confidenceAtExtraction ?? inferConfidenceFromEvidence([record]),
  });
}

function attachSymbolEvidence(
  finding: Finding,
  snapshot: SnapshotRecord,
  symbols?: SymbolRecord[],
): EvidenceRecord[] {
  if (!symbols?.length) return [];

  const fileHint = primaryFilePath(finding);
  const titleTokens = finding.title.toLowerCase().split(/\W+/).filter((t) => t.length > 3);

  const related = symbols.filter((symbol) => {
    const fileMatch = fileHint ? symbol.filePath === fileHint : false;
    const pathMatch = finding.gapCategory
      ? symbol.filePath.toLowerCase().includes(finding.gapCategory.split(" ")[0] ?? "")
      : false;
    const nameMatch = titleTokens.some((token) => symbol.name.toLowerCase().includes(token));
    return fileMatch || pathMatch || nameMatch;
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
  let rawChain = finding.evidenceChain?.length
    ? finding.evidenceChain
    : finding.evidence?.length
      ? finding.evidence
      : symbolEvidence;

  if (!rawChain.length) {
    rawChain = [
      createAbsenceEvidence(
        snapshot,
        finding,
        "No symbol or file evidence matched during enforcement",
        primaryFilePath(finding),
      ),
    ];
  }

  const mergedChain = [...rawChain, ...symbolEvidence];
  const evidenceChain = mergedChain.map((record) => normalizeRecord(record, snapshot, finding));

  const inferred = inferBestConfidenceFromEvidence(evidenceChain);
  const baseConfidence = isConfidenceLevel(finding.confidence)
    ? assertConfidenceLevel(finding.confidence)
    : inferred;

  let reconciledConfidence = finding.contradicted ? "Contradicted" : baseConfidence;
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

export function evidenceQualityMetrics(findings: Finding[]): {
  withRawSnippet: number;
  substantive: number;
  absenceSignals: number;
} {
  let withRawSnippet = 0;
  let substantive = 0;
  let absenceSignals = 0;

  for (const finding of findings) {
    for (const record of finding.evidenceChain) {
      if (hasRichSnippet(record)) withRawSnippet += 1;
      if (isSubstantiveEvidence(record)) substantive += 1;
      if (record.extractionMethod === "absence") absenceSignals += 1;
    }
  }

  return { withRawSnippet, substantive, absenceSignals };
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

  const chain = [
    createAbsenceEvidence(snapshot, { ...placeholder, id: placeholder.id }, description),
  ];

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