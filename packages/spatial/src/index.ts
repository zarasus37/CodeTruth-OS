import { createId } from "@codetruth/core";
import type {
  ArchitectureGraph,
  BuildStateScorecard,
  DependencyEdge,
  Finding,
  SpatialEdge,
  SpatialGraph,
  SpatialLayer,
  SpatialNode,
  SpatialPosition,
  SymbolRecord,
} from "@codetruth/core";

const LAYER_Z: Record<SpatialLayer["nodeKind"], number> = {
  service: 0,
  module: 8,
  file: 16,
  symbol: 24,
  finding: 32,
  domain: -8,
};

function ringPosition(index: number, total: number, radius: number, z: number): SpatialPosition {
  const angle = total > 0 ? (index / total) * Math.PI * 2 : 0;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z,
  };
}

function boundsFromNodes(nodes: SpatialNode[]): SpatialGraph["bounds"] {
  if (!nodes.length) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const node of nodes) {
    min.x = Math.min(min.x, node.position.x);
    min.y = Math.min(min.y, node.position.y);
    min.z = Math.min(min.z, node.position.z);
    max.x = Math.max(max.x, node.position.x);
    max.y = Math.max(max.y, node.position.y);
    max.z = Math.max(max.z, node.position.z);
  }
  return { min, max };
}

export interface BuildSpatialGraphInput {
  architecture: ArchitectureGraph;
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  findings: Finding[];
  scorecard: BuildStateScorecard;
}

export function buildSpatialGraph(input: BuildSpatialGraphInput): SpatialGraph {
  const nodes: SpatialNode[] = [];
  const edges: SpatialEdge[] = [];
  const nodeIndex = new Map<string, string>();

  const services = input.architecture.services;
  for (let i = 0; i < services.length; i++) {
    const svc = services[i]!;
    const id = `spatial:${svc.id}`;
    nodeIndex.set(svc.id, id);
    nodes.push({
      id,
      kind: "service",
      label: svc.name,
      confidence: svc.confidence,
      position: ringPosition(i, services.length, 6, LAYER_Z.service),
    });
  }

  const modules = input.architecture.modules;
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i]!;
    const id = `spatial:${mod.id}`;
    nodeIndex.set(mod.id, id);
    const parent = mod.serviceId ? nodeIndex.get(mod.serviceId) : undefined;
    nodes.push({
      id,
      kind: "module",
      label: mod.name,
      confidence: mod.confidence,
      position: ringPosition(i, modules.length, 14, LAYER_Z.module),
      meta: parent ? { parentService: 1 } : undefined,
    });
    if (parent) {
      edges.push({
        id: createId("edge"),
        from: parent,
        to: id,
        kind: "contains",
        weight: 1,
      });
    }
  }

  const fileSet = new Set<string>();
  for (const sym of input.symbols) fileSet.add(sym.filePath);
  const files = [...fileSet].slice(0, 80);
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]!;
    const id = createId("spatial");
    nodeIndex.set(`file:${filePath}`, id);
    nodes.push({
      id,
      kind: "file",
      label: filePath.split("/").pop() ?? filePath,
      filePath,
      position: ringPosition(i, files.length, 22, LAYER_Z.file),
    });
  }

  const symbolSample = input.symbols.slice(0, 120);
  for (let i = 0; i < symbolSample.length; i++) {
    const sym = symbolSample[i]!;
    const id = createId("spatial");
    nodeIndex.set(sym.id, id);
    const fileNode = nodeIndex.get(`file:${sym.filePath}`);
    nodes.push({
      id,
      kind: "symbol",
      label: sym.name,
      filePath: sym.filePath,
      position: ringPosition(i, symbolSample.length, 30, LAYER_Z.symbol),
      meta: { line: sym.line ?? 0, symbolKind: sym.kind },
    });
    if (fileNode) {
      edges.push({
        id: createId("edge"),
        from: fileNode,
        to: id,
        kind: "defines",
        weight: 0.5,
      });
    }
  }

  for (const dep of input.dependencies.slice(0, 100)) {
    const fromFile = nodeIndex.get(`file:${dep.from}`);
    const toLabel = dep.to.replace(/^\.\//, "");
    const toFile = [...fileSet].find((f) => f.endsWith(toLabel) || f.includes(toLabel));
    const toNode = toFile ? nodeIndex.get(`file:${toFile}`) : undefined;
    if (fromFile && toNode) {
      edges.push({
        id: createId("edge"),
        from: fromFile,
        to: toNode,
        kind: dep.kind,
        weight: 0.7,
      });
    }
  }

  const findingSample = input.findings.slice(0, 40);
  for (let i = 0; i < findingSample.length; i++) {
    const finding = findingSample[i]!;
    const id = `spatial:${finding.id}`;
    nodes.push({
      id,
      kind: "finding",
      label: finding.title,
      severity: finding.severity,
      domain: finding.domain,
      confidence: finding.confidence,
      filePath: finding.evidence[0]?.filePath,
      position: ringPosition(i, findingSample.length, 18, LAYER_Z.finding),
    });
    const evidencePath = finding.evidence[0]?.filePath;
    if (evidencePath) {
      const fileNode = nodeIndex.get(`file:${evidencePath}`);
      if (fileNode) {
        edges.push({
          id: createId("edge"),
          from: fileNode,
          to: id,
          kind: "evidence",
          weight: 1,
        });
      }
    }
  }

  for (let i = 0; i < input.scorecard.domains.length; i++) {
    const domain = input.scorecard.domains[i]!;
    const id = createId("spatial");
    nodes.push({
      id,
      kind: "domain",
      label: domain.domain,
      score: domain.score,
      confidence: domain.confidence,
      domain: domain.domain,
      position: ringPosition(i, input.scorecard.domains.length, 10, LAYER_Z.domain),
    });
  }

  const layers: SpatialLayer[] = [
    { z: LAYER_Z.domain, label: "Scorecard Domains", nodeKind: "domain" },
    { z: LAYER_Z.service, label: "Services", nodeKind: "service" },
    { z: LAYER_Z.module, label: "Modules", nodeKind: "module" },
    { z: LAYER_Z.file, label: "Files", nodeKind: "file" },
    { z: LAYER_Z.symbol, label: "Symbols", nodeKind: "symbol" },
    { z: LAYER_Z.finding, label: "Findings", nodeKind: "finding" },
  ];

  return {
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    layers,
  };
}

export { applySpatialDiffOverlay } from "./diff-overlay.js";
export { buildPortfolioSpatialGraph, buildPortfolioView } from "./portfolio.js";
export type { PortfolioSpatialInput } from "./portfolio.js";