import type { ConfidenceLevel, EvidenceRecord, SeverityLevel } from "./types.js";

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

/** Merge two confidence levels, keeping the more conservative (lower) tier. */
export function mergeConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return confidenceRank(a) <= confidenceRank(b) ? a : b;
}

/** Minimum confidence required to support a given severity tier. */
export function minimumConfidenceForSeverity(severity: SeverityLevel): ConfidenceLevel {
  if (severity === "Critical blocker" || severity === "High-risk flaw") {
    return "Strongly Inferred";
  }
  return "Weakly Inferred";
}

/** Derive confidence from evidence chain strength (AST/config > pattern > inference-only). */
export function inferConfidenceFromEvidence(evidence: EvidenceRecord[]): ConfidenceLevel {
  if (!evidence.length) return "Unknown";

  const methods = new Set(evidence.map((e) => e.extractionMethod));
  const hasLine = evidence.some((e) => e.lineStart != null || e.lineEnd != null);
  const hasSymbol = evidence.some((e) => e.symbolId || e.symbolName);
  const hasSnippet = evidence.some(
    (e) => (e.rawSnippet && e.rawSnippet.length > 8) || (e.snippet && e.snippet.length > 8),
  );

  let structural: ConfidenceLevel = "Unknown";
  if (methods.has("AST") && (hasLine || hasSymbol)) structural = "Confirmed";
  else if (methods.has("config_parse") && hasSnippet) structural = "Confirmed";
  else if (methods.has("pattern_match") && hasLine) structural = "Strongly Inferred";
  else if (methods.has("pattern_match")) structural = "Weakly Inferred";
  else if (methods.has("absence")) structural = "Unknown";
  else if (methods.has("inference")) structural = "Weakly Inferred";

  const extractionLevels = evidence
    .map((e) => e.confidenceAtExtraction)
    .filter((level): level is ConfidenceLevel => level != null);

  if (!extractionLevels.length) return structural;
  return extractionLevels.reduce((acc, level) => mergeConfidence(acc, level), structural);
}

const DESCENDING_LEVELS: ConfidenceLevel[] = [
  "Confirmed",
  "Strongly Inferred",
  "Weakly Inferred",
  "Unknown",
  "Contradicted",
];

/** Lower confidence by N steps on the five-tier ladder. */
export function downgradeConfidence(level: ConfidenceLevel, steps = 1): ConfidenceLevel {
  const idx = DESCENDING_LEVELS.indexOf(level);
  if (idx < 0) return "Unknown";
  return DESCENDING_LEVELS[Math.min(DESCENDING_LEVELS.length - 1, idx + steps)] ?? "Unknown";
}

/** Apply disagreement penalty (0–1) as up to two confidence downgrades. */
export function applyDisagreementPenalty(
  base: ConfidenceLevel,
  dissentCount: number,
  totalModels: number,
): { confidence: ConfidenceLevel; penalty: number } {
  const penalty = totalModels > 0 ? Math.min(1, dissentCount / totalModels) : 0;
  const steps = penalty >= 0.6 ? 2 : penalty > 0.25 ? 1 : 0;
  return { confidence: downgradeConfidence(base, steps), penalty };
}