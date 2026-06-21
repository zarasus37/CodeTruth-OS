import type {
  ArchitectureGraph,
  BuildStateScorecard,
  CouncilEvidenceBundle,
  CouncilFindingContext,
  EvidenceRecord,
  Finding,
} from "./types.js";

function findingChain(finding: Finding): EvidenceRecord[] {
  return finding.evidenceChain?.length ? finding.evidenceChain : finding.evidence;
}

function dedupeEvidence(pool: EvidenceRecord[]): EvidenceRecord[] {
  const seen = new Set<string>();
  const out: EvidenceRecord[] = [];
  for (const record of pool) {
    const key = [
      record.filePath,
      record.lineStart ?? "",
      record.symbolId ?? "",
      record.extractionMethod,
      record.snippet?.slice(0, 80) ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

export function buildCouncilEvidenceBundle(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
): CouncilEvidenceBundle {
  const findingContexts: CouncilFindingContext[] = findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    domain: finding.domain,
    confidence: finding.confidence,
    description: finding.description,
    gapCategory: finding.gapCategory,
    evidenceChain: findingChain(finding),
  }));

  const evidencePool = dedupeEvidence([
    ...findingContexts.flatMap((f) => f.evidenceChain),
    ...architecture.services.flatMap((s) => s.evidence),
  ]);

  return {
    scorecard,
    architecture: {
      services: architecture.services.map((service) => ({
        id: service.id,
        name: service.name,
        confidence: service.confidence,
        evidence: service.evidence,
      })),
      modules: architecture.modules,
      edges: architecture.edges,
    },
    findings: findingContexts,
    evidencePool,
  };
}

export function serializeCouncilEvidenceForLlm(bundle: CouncilEvidenceBundle): string {
  return JSON.stringify(
    {
      scorecard: {
        overall: bundle.scorecard.overall,
        maturityStage: bundle.scorecard.maturityStage,
        domains: bundle.scorecard.domains,
      },
      architecture: {
        services: bundle.architecture.services.map((s) => ({
          name: s.name,
          confidence: s.confidence,
          evidence: s.evidence.slice(0, 3),
        })),
        moduleCount: bundle.architecture.modules.length,
        edgeCount: bundle.architecture.edges.length,
        coupling: bundle.architecture.edges.slice(0, 12).map((e) => `${e.from}→${e.to} (${e.kind})`),
      },
      findings: bundle.findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        domain: f.domain,
        confidence: f.confidence,
        description: f.description,
        gapCategory: f.gapCategory,
        evidenceChain: f.evidenceChain.slice(0, 4).map((e) => ({
          filePath: e.filePath,
          lineStart: e.lineStart,
          lineEnd: e.lineEnd,
          symbolId: e.symbolId,
          extractionMethod: e.extractionMethod,
          snippet: e.snippet?.slice(0, 200),
        })),
      })),
      evidencePoolSize: bundle.evidencePool.length,
      evidencePoolSample: bundle.evidencePool.slice(0, 16).map((e) => ({
        filePath: e.filePath,
        lineStart: e.lineStart,
        extractionMethod: e.extractionMethod,
        snippet: e.snippet?.slice(0, 120),
      })),
    },
    null,
    2,
  );
}