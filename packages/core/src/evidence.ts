import { createId } from "./ids.js";
import { inferConfidenceFromEvidence, mergeConfidence } from "./confidence.js";
import type {
  ConfidenceLevel,
  EvidenceRecord,
  ExtractionMethod,
  Finding,
  SnapshotRecord,
  SymbolRecord,
} from "./types.js";

const SNIPPET_LIMIT = 500;
const RAW_SNIPPET_LIMIT = 1200;

export function hasRichSnippet(record: EvidenceRecord): boolean {
  const raw = record.rawSnippet ?? record.snippet ?? "";
  return raw.trim().length > 8;
}

/** True when evidence has path, method, and extractable text. */
export function isSubstantiveEvidence(record: EvidenceRecord): boolean {
  return Boolean(
    record.filePath &&
      record.extractionMethod &&
      (hasRichSnippet(record) || record.lineStart != null || record.symbolId != null),
  );
}

/** True when evidence has a file/symbol anchor beyond repository-level inference. */
export function hasAnchoredEvidence(chain: EvidenceRecord[]): boolean {
  return chain.some(
    (record) =>
      (record.extractionMethod === "AST" &&
        (record.lineStart != null || record.symbolId != null)) ||
      (record.extractionMethod === "config_parse" && record.filePath !== "repository") ||
      (record.extractionMethod === "pattern_match" && record.lineStart != null),
  );
}

export function enrichEvidenceRecord(
  record: Partial<EvidenceRecord> & Pick<EvidenceRecord, "filePath" | "extractionMethod">,
  snapshot?: SnapshotRecord,
): EvidenceRecord {
  const raw = record.rawSnippet ?? record.snippet ?? "";
  const snippet = (record.snippet ?? raw).slice(0, SNIPPET_LIMIT);
  const confidenceAtExtraction =
    record.confidenceAtExtraction ?? inferConfidenceFromEvidence([record as EvidenceRecord]);

  return {
    id: record.id ?? createId("ev"),
    snapshotHash: record.snapshotHash ?? snapshot?.hash ?? "",
    filePath: record.filePath,
    lineStart: record.lineStart,
    lineEnd: record.lineEnd,
    symbolId: record.symbolId,
    symbolName: record.symbolName,
    snippet,
    rawSnippet: raw.slice(0, RAW_SNIPPET_LIMIT),
    extractionMethod: record.extractionMethod,
    confidenceAtExtraction,
    createdAt: record.createdAt ?? new Date().toISOString(),
    metadata: record.metadata,
  };
}

export function createEvidenceFromSymbol(
  symbol: SymbolRecord,
  snapshotHash?: string,
  extractionMethod: ExtractionMethod = "AST",
): EvidenceRecord {
  const source = symbol.evidenceChain[0] ?? symbol.evidence[0];
  const rawSnippet =
    source?.rawSnippet ??
    source?.snippet ??
    `${symbol.kind} ${symbol.name} @ ${symbol.filePath}`;

  return enrichEvidenceRecord({
    id: source?.id,
    snapshotHash: snapshotHash ?? source?.snapshotHash ?? "",
    filePath: symbol.filePath,
    lineStart: symbol.line ?? source?.lineStart,
    lineEnd: symbol.lineEnd ?? source?.lineEnd,
    symbolId: symbol.id,
    symbolName: symbol.name,
    rawSnippet,
    snippet: rawSnippet.slice(0, SNIPPET_LIMIT),
    extractionMethod: source?.extractionMethod ?? extractionMethod,
    confidenceAtExtraction: symbol.confidence,
    createdAt: source?.createdAt,
    metadata: { parserEngine: symbol.parserEngine },
  });
}

export function createAbsenceEvidence(
  snapshot: SnapshotRecord,
  finding: Pick<Finding, "title" | "description"> & { id?: string },
  reason = "No direct evidence found",
  filePath = "repository",
): EvidenceRecord {
  return enrichEvidenceRecord(
    {
      filePath,
      extractionMethod: "absence",
      rawSnippet: `Absence signal: ${finding.title} — ${reason}`,
      snippet: `Absence: ${finding.title}`,
      confidenceAtExtraction: "Unknown",
      metadata: { reason, findingId: finding.id },
    },
    snapshot,
  );
}

export function createEvidenceFromFinding(finding: Finding): EvidenceRecord[] {
  const chain = finding.evidenceChain?.length ? finding.evidenceChain : finding.evidence;
  return chain.map((record) =>
    enrichEvidenceRecord({
      ...record,
      confidenceAtExtraction: record.confidenceAtExtraction ?? finding.confidence,
    }),
  );
}

export function mergeEvidenceConfidence(records: EvidenceRecord[]): ConfidenceLevel | undefined {
  const levels = records
    .map((r) => r.confidenceAtExtraction)
    .filter((level): level is ConfidenceLevel => level != null);
  if (!levels.length) return undefined;
  return levels.reduce((acc, level) => mergeConfidence(acc, level));
}

export function inferBestConfidenceFromEvidence(chain: EvidenceRecord[]): ConfidenceLevel {
  if (!chain.length) return "Unknown";
  return inferConfidenceFromEvidence(chain);
}