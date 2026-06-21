import type { ConfidenceLevel, EvidenceRecord } from "./types.js";

/** Five-tier confidence taxonomy — enforced at pipeline gate. */
export const CONFIDENCE_LEVELS = [
  "Confirmed",
  "Strongly Inferred",
  "Weakly Inferred",
  "Unknown",
  "Contradicted",
] as const satisfies readonly ConfidenceLevel[];

const RANK: Record<ConfidenceLevel, number> = {
  Confirmed: 5,
  "Strongly Inferred": 4,
  "Weakly Inferred": 3,
  Unknown: 2,
  Contradicted: 1,
};

export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function assertConfidenceLevel(value: unknown): ConfidenceLevel {
  if (!isConfidenceLevel(value)) {
    throw new Error(`Invalid confidence level: ${String(value)}`);
  }
  return value;
}

export function confidenceRank(level: ConfidenceLevel): number {
  return RANK[level];
}

export function confidenceMeetsMinimum(
  actual: ConfidenceLevel,
  minimum: ConfidenceLevel,
): boolean {
  return confidenceRank(actual) >= confidenceRank(minimum);
}

/** Derive confidence from evidence chain strength (AST/config > pattern > inference-only). */
export function inferConfidenceFromEvidence(evidence: EvidenceRecord[]): ConfidenceLevel {
  if (!evidence.length) return "Unknown";

  const methods = new Set(evidence.map((e) => e.extractionMethod));
  const hasLine = evidence.some((e) => e.lineStart != null || e.lineEnd != null);
  const hasSymbol = evidence.some((e) => e.symbolId);
  const hasSnippet = evidence.some((e) => e.snippet && e.snippet.length > 8);

  if (methods.has("AST") && (hasLine || hasSymbol)) return "Confirmed";
  if (methods.has("config_parse") && hasSnippet) return "Confirmed";
  if (methods.has("pattern_match") && hasLine) return "Strongly Inferred";
  if (methods.has("pattern_match")) return "Weakly Inferred";
  if (methods.has("inference")) return "Weakly Inferred";
  return "Unknown";
}