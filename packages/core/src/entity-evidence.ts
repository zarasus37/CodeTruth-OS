import { mergeConfidence } from "./confidence.js";
import type {
  ConfidenceLevel,
  DependencyEdge,
  EvidenceRecord,
  Finding,
  SymbolRecord,
} from "./types.js";

const SNIPPET_LIMIT = 500;
const RAW_SNIPPET_LIMIT = 1200;

export function enrichEvidenceRecord(record: EvidenceRecord): EvidenceRecord {
  const raw = record.rawSnippet ?? record.snippet ?? "";
  const snippet = (record.snippet ?? raw).slice(0, SNIPPET_LIMIT);
  return {
    ...record,
    snippet,
    rawSnippet: raw.slice(0, RAW_SNIPPET_LIMIT),
    symbolName: record.symbolName,
    confidenceAtExtraction: record.confidenceAtExtraction,
  };
}

export function createEvidenceFromSymbol(
  symbol: SymbolRecord,
  snapshotHash?: string,
): EvidenceRecord {
  const source = symbol.evidenceChain[0] ?? symbol.evidence[0];
  const rawSnippet =
    source?.rawSnippet ??
    source?.snippet ??
    `${symbol.kind} ${symbol.name} @ ${symbol.filePath}`;

  return enrichEvidenceRecord({
    snapshotHash: snapshotHash ?? source?.snapshotHash ?? "",
    filePath: symbol.filePath,
    lineStart: symbol.line ?? source?.lineStart,
    lineEnd: symbol.lineEnd ?? source?.lineEnd,
    symbolId: symbol.id,
    symbolName: symbol.name,
    rawSnippet,
    snippet: rawSnippet.slice(0, SNIPPET_LIMIT),
    extractionMethod: source?.extractionMethod ?? "AST",
    confidenceAtExtraction: symbol.confidence,
  });
}

export function createEvidenceFromDependency(
  edge: DependencyEdge,
  snapshotHash?: string,
): EvidenceRecord {
  const source = edge.evidenceChain[0] ?? edge.evidence[0];
  const rawSnippet =
    source?.rawSnippet ??
    source?.snippet ??
    `${edge.kind} ${edge.to}${edge.resolvedTo ? ` → ${edge.resolvedTo}` : ""}`;

  return enrichEvidenceRecord({
    snapshotHash: snapshotHash ?? source?.snapshotHash ?? "",
    filePath: edge.from,
    lineStart: edge.line ?? source?.lineStart,
    lineEnd: source?.lineEnd,
    rawSnippet,
    snippet: rawSnippet.slice(0, SNIPPET_LIMIT),
    extractionMethod: source?.extractionMethod ?? "AST",
    confidenceAtExtraction: edge.confidence,
  });
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