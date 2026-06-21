import type { Finding, MarketplaceAnalyzerRun, SnapshotRecord } from "@codetruth/core";
import { runAgentsAnalyzer } from "./analyzers/agents.js";
import { runDefiAnalyzer } from "./analyzers/defi.js";
import { runSolidityAnalyzer } from "./analyzers/solidity.js";
import { getMarketplaceAnalyzer, listMarketplaceAnalyzers } from "./registry.js";

export { listMarketplaceAnalyzers, getMarketplaceAnalyzer, MARKETPLACE_ANALYZERS } from "./registry.js";

const RUNNERS: Record<string, (snapshot: SnapshotRecord) => MarketplaceAnalyzerRun> = {
  "solidity-audit": runSolidityAnalyzer,
  "defi-risk": runDefiAnalyzer,
  "agent-safety": runAgentsAnalyzer,
};

export function runMarketplaceAnalyzer(
  snapshot: SnapshotRecord,
  analyzerId: string,
): MarketplaceAnalyzerRun {
  const definition = getMarketplaceAnalyzer(analyzerId);
  const runner = RUNNERS[analyzerId];
  if (!definition || !runner) {
    throw new Error(`Unknown marketplace analyzer: ${analyzerId}`);
  }
  return runner(snapshot);
}

export function degradedMarketplaceRun(
  analyzerId: string,
  message: string,
): MarketplaceAnalyzerRun {
  const definition = getMarketplaceAnalyzer(analyzerId);
  return {
    analyzerId,
    analyzerName: definition?.name ?? analyzerId,
    category: definition?.category ?? "agents",
    version: definition?.version ?? "0.0.0",
    findings: [],
    summary: `Degraded: ${message}`,
    durationMs: 0,
  };
}

export function runMarketplaceAnalyzers(
  snapshot: SnapshotRecord,
  enabledAnalyzerIds: string[],
): MarketplaceAnalyzerRun[] {
  const unique = [...new Set(enabledAnalyzerIds)];
  const runs: MarketplaceAnalyzerRun[] = [];

  for (const analyzerId of unique) {
    try {
      runs.push(runMarketplaceAnalyzer(snapshot, analyzerId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "analyzer failed";
      runs.push(degradedMarketplaceRun(analyzerId, message));
    }
  }

  return runs;
}

export function mergeMarketplaceFindings(
  baseFindings: Finding[],
  runs: MarketplaceAnalyzerRun[],
): Finding[] {
  const supplemental = runs.flatMap((run) => run.findings);
  return supplemental.length ? [...baseFindings, ...supplemental] : baseFindings;
}