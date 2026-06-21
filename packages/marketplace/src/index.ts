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

export function runMarketplaceAnalyzers(
  snapshot: SnapshotRecord,
  enabledAnalyzerIds: string[],
): MarketplaceAnalyzerRun[] {
  const unique = [...new Set(enabledAnalyzerIds)];
  const runs: MarketplaceAnalyzerRun[] = [];

  for (const analyzerId of unique) {
    const definition = getMarketplaceAnalyzer(analyzerId);
    const runner = RUNNERS[analyzerId];
    if (!definition || !runner) continue;
    try {
      runs.push(runner(snapshot));
    } catch (error) {
      const message = error instanceof Error ? error.message : "analyzer failed";
      runs.push({
        analyzerId,
        analyzerName: definition.name,
        category: definition.category,
        version: definition.version,
        findings: [],
        summary: `Degraded: ${message}`,
        durationMs: 0,
      });
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