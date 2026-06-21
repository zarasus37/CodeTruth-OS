import type { SnapshotDiff, SpatialDiffState, SpatialGraph, SymbolRecord } from "@codetruth/core";

function symbolKey(filePath: string, name: string, kind: string): string {
  return `${filePath}::${kind}::${name}`;
}

export function applySpatialDiffOverlay(
  graph: SpatialGraph,
  diff: SnapshotDiff,
): SpatialGraph {
  const addedFiles = new Set(diff.added.map((f) => f.path));
  const removedFiles = new Set(diff.removed.map((f) => f.path));
  const modifiedFiles = new Set(diff.modified.map((f) => f.path));

  const symbolChangeMap = new Map<string, SpatialDiffState>();
  for (const change of diff.symbolChanges ?? []) {
    symbolChangeMap.set(symbolKey(change.filePath, change.name, change.kind), change.change);
  }

  const nodes = graph.nodes.map((node) => {
    if (node.kind === "file" && node.filePath) {
      if (addedFiles.has(node.filePath)) return { ...node, diffState: "added" as const };
      if (removedFiles.has(node.filePath)) return { ...node, diffState: "removed" as const };
      if (modifiedFiles.has(node.filePath)) return { ...node, diffState: "modified" as const };
      return { ...node, diffState: "unchanged" as const };
    }

    if (node.kind === "symbol" && node.filePath) {
      const key = symbolKey(
        node.filePath,
        node.label,
        String(node.meta?.symbolKind ?? "function"),
      );
      const state = symbolChangeMap.get(key);
      if (state) return { ...node, diffState: state };
      if (modifiedFiles.has(node.filePath)) return { ...node, diffState: "modified" as const };
      if (addedFiles.has(node.filePath)) return { ...node, diffState: "added" as const };
    }

    if (node.kind === "finding" && node.filePath) {
      if (modifiedFiles.has(node.filePath)) return { ...node, diffState: "modified" as const };
      if (addedFiles.has(node.filePath)) return { ...node, diffState: "added" as const };
    }

    return node;
  });

  return {
    ...graph,
    nodes,
    diffOverlay: {
      baseSnapshotId: diff.baseSnapshotId,
      targetSnapshotId: diff.targetSnapshotId,
      driftScore: diff.driftScore,
      changeRatio: diff.changeRatio,
    },
  };
}

export function buildDiffFromSymbols(
  baseSymbols: SymbolRecord[],
  targetSymbols: SymbolRecord[],
  filePaths: { added: string[]; removed: string[]; modified: string[] },
  snapshotIds: { base: string; target: string },
): SnapshotDiff {
  const baseMap = new Map(baseSymbols.map((s) => [symbolKey(s.filePath, s.name, s.kind), s]));
  const targetMap = new Map(targetSymbols.map((s) => [symbolKey(s.filePath, s.name, s.kind), s]));
  const symbolChanges: SnapshotDiff["symbolChanges"] = [];

  for (const [key, sym] of targetMap) {
    if (!baseMap.has(key)) {
      symbolChanges.push({
        name: sym.name,
        kind: sym.kind,
        filePath: sym.filePath,
        change: "added",
        line: sym.line,
      });
    }
  }
  for (const [key, sym] of baseMap) {
    if (!targetMap.has(key)) {
      symbolChanges.push({
        name: sym.name,
        kind: sym.kind,
        filePath: sym.filePath,
        change: "removed",
        line: sym.line,
      });
    }
  }

  const totalChanges = filePaths.added.length + filePaths.removed.length + filePaths.modified.length;
  const changeRatio = totalChanges / Math.max(totalChanges + 1, 1);

  return {
    baseSnapshotId: snapshotIds.base,
    targetSnapshotId: snapshotIds.target,
    added: filePaths.added.map((path) => ({ path, hash: "", size: 0 })),
    removed: filePaths.removed.map((path) => ({ path, hash: "", size: 0 })),
    modified: filePaths.modified.map((path) => ({
      path,
      beforeHash: "",
      afterHash: "",
      sizeDelta: 0,
    })),
    unchanged: 0,
    changeRatio,
    symbolChanges,
    driftScore: changeRatio,
  };
}