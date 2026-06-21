import { readFileSync } from "node:fs";
import path from "node:path";
import { createId } from "@codetruth/core";
import type { Finding, MarketplaceAnalyzerRun, SnapshotRecord } from "@codetruth/core";

const AGENT_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
  description: string;
  severity: Finding["severity"];
}> = [
  {
    pattern: /child_process|execSync|spawn\(/,
    title: "Unsandboxed process execution",
    description: "Agent toolchains invoking shell commands need sandboxing and allowlists.",
    severity: "Critical blocker",
  },
  {
    pattern: /eval\s*\(|new Function\s*\(/,
    title: "Dynamic code evaluation",
    description: "eval/Function constructors expand prompt-injection blast radius for agent runtimes.",
    severity: "Critical blocker",
  },
  {
    pattern: /tool_call|tools:\s*\[|bindTools|function_call/i,
    title: "LLM tool invocation surface",
    description: "Tool-calling agents require input validation, authz, and output filtering per tool.",
    severity: "Medium-priority weakness",
  },
  {
    pattern: /systemPrompt|system_prompt|instructions.*user/i,
    title: "Prompt boundary mixing",
    description: "Mixing untrusted user content into system instructions increases injection risk.",
    severity: "High-risk flaw",
  },
];

function candidatePaths(snapshot: SnapshotRecord): string[] {
  return snapshot.manifest
    .map((entry) => entry.path)
    .filter(
      (filePath) =>
        filePath.endsWith(".ts") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".py") ||
        filePath.endsWith(".tsx"),
    );
}

export function runAgentsAnalyzer(snapshot: SnapshotRecord): MarketplaceAnalyzerRun {
  const started = Date.now();
  const findings: Finding[] = [];

  for (const relativePath of candidatePaths(snapshot)) {
    let content: string;
    try {
      content = readFileSync(path.join(snapshot.rootPath, relativePath), "utf8");
    } catch {
      continue;
    }

    for (const rule of AGENT_PATTERNS) {
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
            filePath: relativePath,
            extractionMethod: "pattern_match",
            snippet: content.match(rule.pattern)?.[0]?.slice(0, 120),
          },
        ],
        gapCategory: "authentication system",
      });
    }
  }

  return {
    analyzerId: "agent-safety",
    analyzerName: "AI Agent Safety Analyzer",
    category: "agents",
    version: "1.0.0",
    findings,
    summary:
      findings.length === 0
        ? "No high-risk agent execution patterns detected."
        : `${findings.length} agent safety signal(s) detected.`,
    durationMs: Date.now() - started,
  };
}