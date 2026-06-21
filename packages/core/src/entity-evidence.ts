export {
  createAbsenceEvidence,
  createEvidenceFromFinding,
  createEvidenceFromSymbol,
  enrichEvidenceRecord,
  hasRichSnippet,
  inferBestConfidenceFromEvidence,
  isSubstantiveEvidence,
  mergeEvidenceConfidence,
} from "./evidence.js";
import { enrichEvidenceRecord } from "./evidence.js";
import type { DependencyEdge, EvidenceRecord } from "./types.js";

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
    id: source?.id,
    snapshotHash: snapshotHash ?? source?.snapshotHash ?? "",
    filePath: edge.from,
    lineStart: edge.line ?? source?.lineStart,
    lineEnd: source?.lineEnd,
    rawSnippet,
    snippet: rawSnippet.slice(0, 500),
    extractionMethod: source?.extractionMethod ?? "AST",
    confidenceAtExtraction: edge.confidence,
    createdAt: source?.createdAt,
    metadata: { dependencyKind: edge.kind, resolvedTo: edge.resolvedTo },
  });
}