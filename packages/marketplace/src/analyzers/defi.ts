import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding, MarketplaceAnalyzerRun, SnapshotRecord } from "@codetruth/core";
import { marketplaceFinding } from "../finding.js";

const DEFI_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  severity: Finding["severity"];
}> = [
  {
    pattern: /Chainlink|AggregatorV3Interface|priceFeed/i,
    title: "Oracle dependency detected",
    description: "DeFi logic relies on external price feeds; validate staleness bounds and fallback oracles.",
    severity: "Medium-priority weakness",
  },
  {
    pattern: /onlyOwner|owner\s*\(\)|transferOwnership/i,
    title: "Centralized admin control",
    description: "Owner-gated functions create single-key operational risk for treasury and parameters.",
    severity: "High-risk flaw",
  },
  {
    pattern: /pause\s*\(|whenNotPaused|Pausable/i,
    title: "Pausable protocol surface",
    description: "Pause switches can protect users but also introduce governance and liveness risk.",
    severity: "Informational observation",
  },
  {
    pattern: /upgradeTo|UUPSUpgradeable|TransparentUpgradeableProxy/i,
    title: "Upgradeable proxy pattern",
    description: "Upgradeable contracts require timelocks, multisig, and storage layout discipline.",
    severity: "High-risk flaw",
  },
];

function candidatePaths(snapshot: SnapshotRecord): string[] {
  return snapshot.manifest
    .map((entry) => entry.path)
    .filter(
      (filePath) =>
        filePath.endsWith(".sol") ||
        filePath.endsWith(".ts") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".py"),
    );
}

export function runDefiAnalyzer(snapshot: SnapshotRecord): MarketplaceAnalyzerRun {
  const started = Date.now();
  const findings: Finding[] = [];

  for (const relativePath of candidatePaths(snapshot)) {
    let content: string;
    try {
      content = readFileSync(path.join(snapshot.rootPath, relativePath), "utf8");
    } catch {
      continue;
    }

    for (const rule of DEFI_PATTERNS) {
      if (!rule.pattern.test(content)) continue;
      findings.push(
        marketplaceFinding({
          snapshotHash: snapshot.hash,
          filePath: relativePath,
          title: rule.title,
          description: rule.description,
          severity: rule.severity,
          snippet: content.match(rule.pattern)?.[0]?.slice(0, 120),
          confidence: "Weakly Inferred",
        }),
      );
    }
  }

  return {
    analyzerId: "defi-risk",
    analyzerName: "DeFi Protocol Risk Analyzer",
    category: "defi",
    version: "1.0.0",
    findings,
    summary:
      findings.length === 0
        ? "No DeFi governance/oracle patterns detected."
        : `${findings.length} DeFi risk signal(s) detected.`,
    durationMs: Date.now() - started,
  };
}