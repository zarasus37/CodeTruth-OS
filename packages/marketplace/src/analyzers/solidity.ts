import { readFileSync } from "node:fs";
import path from "node:path";
import { createId } from "@codetruth/core";
import type { Finding, MarketplaceAnalyzerRun, SnapshotRecord } from "@codetruth/core";

const SOLIDITY_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  severity: Finding["severity"];
}> = [
  {
    pattern: /\.call\{value:/,
    title: "Low-level call with value transfer",
    description: "External calls with value may be reentrancy vectors without checks-effects-interactions.",
    severity: "High-risk flaw",
  },
  {
    pattern: /tx\.origin/,
    title: "tx.origin authentication",
    description: "Using tx.origin for authorization is vulnerable to phishing-style delegate attacks.",
    severity: "Critical blocker",
  },
  {
    pattern: /selfdestruct\s*\(/,
    title: "selfdestruct usage",
    description: "Contracts with selfdestruct can be destroyed, breaking immutability assumptions.",
    severity: "Medium-priority weakness",
  },
  {
    pattern: /delegatecall\s*\(/,
    title: "delegatecall detected",
    description: "delegatecall forwards storage context; unsafe targets enable proxy takeover.",
    severity: "High-risk flaw",
  },
];

function isSolidityPath(filePath: string): boolean {
  return filePath.endsWith(".sol");
}

export function runSolidityAnalyzer(snapshot: SnapshotRecord): MarketplaceAnalyzerRun {
  const started = Date.now();
  const findings: Finding[] = [];

  for (const entry of snapshot.manifest) {
    if (!isSolidityPath(entry.path)) continue;
    let content: string;
    try {
      content = readFileSync(path.join(snapshot.rootPath, entry.path), "utf8");
    } catch {
      continue;
    }

    for (const rule of SOLIDITY_PATTERNS) {
      if (!rule.pattern.test(content)) continue;
      findings.push({
        id: createId("finding"),
        domain: "security posture",
        severity: rule.severity,
        confidence: "Strongly Inferred",
        title: rule.title,
        description: rule.description,
        evidence: [
          {
            snapshotHash: snapshot.hash,
            filePath: entry.path,
            extractionMethod: "pattern_match",
            snippet: content.match(rule.pattern)?.[0]?.slice(0, 120),
          },
        ],
        gapCategory: "secrets management",
      });
    }
  }

  return {
    analyzerId: "solidity-audit",
    analyzerName: "Solidity Security Scanner",
    category: "solidity",
    version: "1.0.0",
    findings,
    summary:
      findings.length === 0
        ? "No Solidity anti-patterns detected in manifest."
        : `${findings.length} Solidity risk pattern(s) detected.`,
    durationMs: Date.now() - started,
  };
}