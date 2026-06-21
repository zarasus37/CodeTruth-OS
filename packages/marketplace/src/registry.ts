import type { MarketplaceAnalyzerDefinition } from "@codetruth/core";

export const MARKETPLACE_ANALYZERS: MarketplaceAnalyzerDefinition[] = [
  {
    id: "solidity-audit",
    name: "Solidity Security Scanner",
    category: "solidity",
    description:
      "Pattern-based Solidity risk checks: reentrancy surfaces, unchecked calls, tx.origin, selfdestruct.",
    version: "1.0.0",
    requiredFeature: "marketplace_analyzers",
    revenueTier: "phase4",
  },
  {
    id: "defi-risk",
    name: "DeFi Protocol Risk Analyzer",
    category: "defi",
    description:
      "Heuristic DeFi posture: oracle reliance, admin keys, pause mechanisms, upgradeable proxies.",
    version: "1.0.0",
    requiredFeature: "marketplace_analyzers",
    revenueTier: "phase4",
  },
  {
    id: "agent-safety",
    name: "AI Agent Safety Analyzer",
    category: "agents",
    description:
      "Agentic code patterns: tool invocation boundaries, prompt injection surfaces, unsandboxed exec.",
    version: "1.0.0",
    requiredFeature: "marketplace_analyzers",
    revenueTier: "phase4",
  },
];

export function listMarketplaceAnalyzers(): MarketplaceAnalyzerDefinition[] {
  return MARKETPLACE_ANALYZERS;
}

export function getMarketplaceAnalyzer(id: string): MarketplaceAnalyzerDefinition | undefined {
  return MARKETPLACE_ANALYZERS.find((analyzer) => analyzer.id === id);
}