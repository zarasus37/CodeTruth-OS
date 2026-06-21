import { createId } from "@codetruth/core";
import type { EvidenceRecord, Finding, GapCategory } from "@codetruth/core";

export function marketplaceFinding(input: {
  snapshotHash: string;
  filePath: string;
  title: string;
  description: string;
  severity: Finding["severity"];
  snippet?: string;
  lineStart?: number;
  gapCategory?: GapCategory;
  confidence?: Finding["confidence"];
}): Finding {
  const evidenceChain: EvidenceRecord[] = [
    {
      snapshotHash: input.snapshotHash,
      filePath: input.filePath,
      lineStart: input.lineStart,
      extractionMethod: "pattern_match",
      snippet: input.snippet?.slice(0, 500),
    },
  ];

  return {
    id: createId("finding"),
    domain: "security posture",
    severity: input.severity,
    confidence: input.confidence ?? "Strongly Inferred",
    title: input.title,
    description: input.description,
    evidence: evidenceChain,
    evidenceChain,
    gapCategory: input.gapCategory ?? "secrets management",
  };
}