import type {
  ArchitectureGraph,
  BuildStateScorecard,
  CouncilEvidenceBundle,
  CouncilFindingContext,
  CouncilModelContext,
  EvidenceRecord,
  Finding,
  ScoringDomain,
} from "./types.js";

const MODEL_DOMAINS: Record<string, ScoringDomain[]> = {
  "Architecture Model": ["code structure", "integration health"],
  "Runtime Model": ["runtime readiness", "build readiness"],
  "DevOps Model": ["DevOps maturity", "observability"],
  "Security Model": ["security posture"],
  "Planning Model": [],
};

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

function snippetText(record: EvidenceRecord): string {
  return (record.rawSnippet ?? record.snippet ?? "").slice(0, 400);
}

function architectureNodesForModel(
  bundle: CouncilEvidenceBundle,
  domains: ScoringDomain[],
): CouncilModelContext["architectureNodes"] {
  const nodes: CouncilModelContext["architectureNodes"] = [];
  const includeAll = domains.length === 0;

  for (const service of bundle.architecture.services) {
    if (includeAll || domains.includes("integration health") || domains.includes("code structure")) {
      nodes.push({
        id: service.id,
        name: service.name,
        kind: "service",
        confidence: service.confidence,
      });
    }
  }

  for (const mod of bundle.architecture.modules) {
    if (includeAll || domains.includes("code structure")) {
      nodes.push({
        id: mod.id,
        name: mod.name,
        kind: "module",
        confidence: mod.confidence,
        relatedTo: mod.serviceId,
      });
    }
  }

  for (const edge of bundle.architecture.edges.slice(0, 16)) {
    if (includeAll || domains.includes("integration health") || domains.includes("code structure")) {
      nodes.push({
        id: `${edge.from}→${edge.to}`,
        name: `${edge.from} → ${edge.to} (${edge.kind})`,
        kind: "edge",
        confidence: edge.confidence,
      });
    }
  }

  return nodes.slice(0, 20);
}

export function buildModelContext(
  bundle: CouncilEvidenceBundle,
  model: string,
  scopedFindings?: CouncilFindingContext[],
): CouncilModelContext {
  const domains = MODEL_DOMAINS[model] ?? [];
  const findings =
    scopedFindings ??
    (domains.length
      ? bundle.findings.filter((f) => domains.includes(f.domain))
      : bundle.findings);

  const fileSet = new Set(findings.flatMap((f) => f.evidenceChain.map((e) => e.filePath)));
  const poolSnippets = bundle.evidencePool
    .filter((e) => fileSet.has(e.filePath) || domains.length === 0)
    .slice(0, 14);

  const findingSnippets = findings.flatMap((f) => f.evidenceChain).slice(0, 10);
  const merged = dedupeEvidence([...findingSnippets, ...poolSnippets]);

  return {
    model,
    sourceSnippets: merged.slice(0, 16).map((e) => ({
      filePath: e.filePath,
      lineStart: e.lineStart,
      lineEnd: e.lineEnd,
      symbolName: e.symbolName,
      extractionMethod: e.extractionMethod,
      snippet: snippetText(e) || `${e.extractionMethod} evidence at ${e.filePath}`,
    })),
    architectureNodes: architectureNodesForModel(bundle, domains),
    relatedFindings: findings.slice(0, 12).map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      confidence: f.confidence,
      domain: f.domain,
      description: f.description.slice(0, 240),
      evidencePreview: f.evidenceChain.slice(0, 3).map((e) => {
        const loc = e.lineStart != null ? `:${e.lineStart}` : "";
        const snippet = (e.rawSnippet ?? e.snippet ?? "").slice(0, 80);
        const method = e.extractionMethod;
        const conf = e.confidenceAtExtraction ?? "Unknown";
        return `${e.filePath}${loc} [${method}, ${conf}]${snippet ? `: ${snippet}` : ""}`;
      }),
    })),
  };
}

export function serializeModelContextForLlm(context: CouncilModelContext): string {
  return JSON.stringify(
    {
      model: context.model,
      sourceSnippets: context.sourceSnippets,
      architectureNodes: context.architectureNodes,
      relatedFindings: context.relatedFindings,
    },
    null,
    2,
  );
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