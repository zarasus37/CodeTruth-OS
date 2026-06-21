import { createLlmAnalysisEvidence } from "@codetruth/core";
import type {
  CouncilPhaseResult,
  EvidenceRecord,
  Finding,
} from "@codetruth/core";

const FILE_PATH_PATTERN =
  /(?:^|[\s[(])([A-Za-z0-9_./-]+\.(?:tsx|jsx|yaml|json|toml|ts|js|py|go|rs|yml|md)|(?:^|[\s[(])\.github\/[^\s)]+)/gi;

export function extractFilePathsFromClaim(text: string): string[] {
  const paths = new Set<string>();
  for (const match of text.matchAll(FILE_PATH_PATTERN)) {
    const path = match[1]?.replace(/^['"]|['"]$/g, "").trim();
    if (path) paths.add(path);
  }
  return [...paths];
}

export function resolvePoolEvidence(
  filePath: string,
  pool: EvidenceRecord[],
): EvidenceRecord | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  return pool.find((record) => {
    const candidate = record.filePath.replace(/\\/g, "/");
    return (
      candidate === normalized ||
      candidate.endsWith(`/${normalized}`) ||
      normalized.endsWith(candidate)
    );
  });
}

export function buildLlmEvidenceFromBullet(input: {
  bullet: string;
  model: string;
  snapshotHash: string;
  pool: EvidenceRecord[];
  phase: "independent" | "cross_review" | "consensus";
}): EvidenceRecord {
  const citedPaths = extractFilePathsFromClaim(input.bullet);
  const matched = citedPaths
    .map((path) => resolvePoolEvidence(path, input.pool))
    .find(Boolean);

  return createLlmAnalysisEvidence({
    snapshotHash: input.snapshotHash,
    model: input.model,
    claim: input.bullet,
    filePath: matched?.filePath ?? citedPaths[0] ?? "repository",
    lineStart: matched?.lineStart,
    lineEnd: matched?.lineEnd,
    symbolId: matched?.symbolId,
    symbolName: matched?.symbolName,
    phase: input.phase,
    metadata: {
      citedPaths,
      corroboratingEvidenceId: matched?.id,
    },
  });
}

function matchBulletToFinding(bullet: string, findings: Finding[]): Finding | undefined {
  const lower = bullet.toLowerCase();

  for (const finding of findings) {
    if (finding.id && lower.includes(finding.id.toLowerCase())) return finding;
  }

  for (const finding of findings) {
    const titleTokens = finding.title
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 3);
    if (titleTokens.some((token) => lower.includes(token))) return finding;
  }

  for (const finding of findings) {
    const paths = finding.evidenceChain
      .map((record) => record.filePath)
      .filter((path) => path !== "repository");
    if (paths.some((path) => lower.includes(path.toLowerCase()))) return finding;
  }

  return undefined;
}

function snapshotHashFrom(
  evidencePool: EvidenceRecord[],
  findings: Finding[],
): string {
  return (
    evidencePool[0]?.snapshotHash ??
    findings[0]?.evidenceChain[0]?.snapshotHash ??
    ""
  );
}

/** Attach LLM council bullets as llm_analysis evidence links on matching findings. */
export function applyLlmCouncilEvidenceToFindings(
  findings: Finding[],
  phases: CouncilPhaseResult[],
  evidencePool: EvidenceRecord[],
): Finding[] {
  const snapshotHash = snapshotHashFrom(evidencePool, findings);
  const additions = new Map<string, EvidenceRecord[]>();

  for (const phase of phases) {
    for (const assessment of phase.structuredAssessments ?? []) {
      for (const bullet of assessment.bullets) {
        const record = buildLlmEvidenceFromBullet({
          bullet,
          model: assessment.model,
          snapshotHash,
          pool: evidencePool,
          phase: phase.phase,
        });
        const finding = matchBulletToFinding(bullet, findings);
        if (!finding) continue;
        const chain = additions.get(finding.id) ?? [];
        chain.push(record);
        additions.set(finding.id, chain);
      }
    }
  }

  return findings.map((finding) => {
    const extra = additions.get(finding.id);
    if (!extra?.length) return finding;

    const evidenceChain = [...finding.evidenceChain, ...extra];
    return {
      ...finding,
      evidence: evidenceChain,
      evidenceChain,
    };
  });
}

export function buildLlmEvidenceCitedFromBullets(input: {
  bullets: string[];
  model: string;
  snapshotHash: string;
  pool: EvidenceRecord[];
  phase: "independent" | "cross_review" | "consensus";
  limit?: number;
}): EvidenceRecord[] {
  return input.bullets.slice(0, input.limit ?? 8).map((bullet) =>
    buildLlmEvidenceFromBullet({
      bullet,
      model: input.model,
      snapshotHash: input.snapshotHash,
      pool: input.pool,
      phase: input.phase,
    }),
  );
}