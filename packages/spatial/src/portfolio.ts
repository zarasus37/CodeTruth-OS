import { createId } from "@codetruth/core";
import type {
  PortfolioProjectEntry,
  PortfolioSpatialGraph,
  PortfolioView,
  SpatialGraph,
  SpatialPosition,
} from "@codetruth/core";

export interface PortfolioSpatialInput {
  projectId: string;
  projectName: string;
  analysisId: string;
  spatialGraph: SpatialGraph;
}

const GRID_SPACING = 90;

function offsetPosition(pos: SpatialPosition, offset: SpatialPosition): SpatialPosition {
  return { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
}

export function buildPortfolioSpatialGraph(
  entries: PortfolioSpatialInput[],
): PortfolioSpatialGraph {
  const nodes = [];
  const edges = [];
  const projects = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const col = i % 3;
    const row = Math.floor(i / 3);
    const offset: SpatialPosition = {
      x: (col - 1) * GRID_SPACING,
      y: (row - 1) * GRID_SPACING,
      z: 0,
    };

    const hubId = createId("spatial");
    nodes.push({
      id: hubId,
      kind: "service" as const,
      label: entry.projectName,
      position: offset,
      meta: { projectId: entry.projectId, portfolioHub: 1 },
    });

    const idPrefix = `${entry.projectId}:`;
    for (const node of entry.spatialGraph.nodes) {
      nodes.push({
        ...node,
        id: `${idPrefix}${node.id}`,
        position: offsetPosition(node.position, offset),
        meta: { ...node.meta, projectId: entry.projectId },
      });
    }

    for (const edge of entry.spatialGraph.edges) {
      edges.push({
        ...edge,
        id: `${idPrefix}${edge.id}`,
        from: `${idPrefix}${edge.from}`,
        to: `${idPrefix}${edge.to}`,
      });
    }

    projects.push({
      projectId: entry.projectId,
      projectName: entry.projectName,
      analysisId: entry.analysisId,
      offset,
    });
  }

  const bounds = entries.length
    ? {
        min: { x: -GRID_SPACING * 2, y: -GRID_SPACING * 2, z: -10 },
        max: { x: GRID_SPACING * 2, y: GRID_SPACING * 2, z: 40 },
      }
    : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

  return {
    nodes,
    edges,
    bounds,
    layers: [
      { z: -8, label: "Portfolio Projects", nodeKind: "service" },
      { z: 0, label: "Domains", nodeKind: "domain" },
      { z: 8, label: "Services", nodeKind: "service" },
      { z: 16, label: "Modules", nodeKind: "module" },
      { z: 24, label: "Files", nodeKind: "file" },
      { z: 32, label: "Symbols", nodeKind: "symbol" },
      { z: 40, label: "Findings", nodeKind: "finding" },
    ],
    projects,
  };
}

const DRIFT_ALERT_THRESHOLD = 0.25;

const EMPTY_MATURITY: PortfolioView["maturityDistribution"] = {
  prototype: 0,
  developing: 0,
  production_candidate: 0,
  production_ready: 0,
};

export function buildPortfolioView(
  workspaceId: string,
  entries: PortfolioProjectEntry[],
): PortfolioView {
  const scored = entries.filter((e) => e.overallScore != null);
  const aggregateScore = scored.length
    ? Math.round(scored.reduce((sum, e) => sum + (e.overallScore ?? 0), 0) / scored.length)
    : 0;

  const complianceScored = entries.filter((e) => e.complianceScore != null);
  const aggregateComplianceScore = complianceScored.length
    ? Math.round(
        complianceScored.reduce((sum, e) => sum + (e.complianceScore ?? 0), 0) /
          complianceScored.length,
      )
    : 0;

  const maturityDistribution = { ...EMPTY_MATURITY };
  for (const entry of entries) {
    if (entry.maturityStage) {
      maturityDistribution[entry.maturityStage] += 1;
    }
  }

  const driftAlerts = entries
    .filter((e) => e.driftScore != null && e.driftScore >= DRIFT_ALERT_THRESHOLD)
    .map((e) => ({
      projectId: e.projectId,
      projectName: e.projectName,
      driftScore: e.driftScore!,
    }))
    .sort((a, b) => b.driftScore - a.driftScore);

  return {
    workspaceId,
    projects: entries,
    aggregateScore,
    aggregateComplianceScore,
    projectCount: entries.length,
    maturityDistribution,
    driftAlerts,
  };
}