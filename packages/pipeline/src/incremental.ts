import type {
  DependencyEdge,
  IncrementalComputeMetrics,
  ParserStats,
  SnapshotDiff,
  SymbolRecord,
} from "@codetruth/core";

export interface ParseSlice {
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  parserStats: ParserStats;
}

/** Blueprint Phase C target: 85–90% compute savings on small diffs. */
export const INCREMENTAL_SAVINGS_TARGET_PERCENT = 85;

export interface MergeIncrementalInput {
  base: ParseSlice;
  delta: ParseSlice;
  diff: SnapshotDiff;
  filesTotal: number;
}

export function changedFilePaths(diff: SnapshotDiff): Set<string> {
  const paths = new Set<string>();
  for (const entry of diff.added) paths.add(entry.path);
  for (const entry of diff.modified) paths.add(entry.path);
  for (const entry of diff.removed) paths.add(entry.path);
  return paths;
}

export function mergeIncrementalParse(input: MergeIncrementalInput): {
  result: ParseSlice;
  metrics: IncrementalComputeMetrics;
} {
  const changed = changedFilePaths(input.diff);
  const removed = new Set(input.diff.removed.map((e) => e.path));

  const retainedSymbols = input.base.symbols.filter((s) => !removed.has(s.filePath) && !changed.has(s.filePath));
  const retainedDeps = input.base.dependencies.filter(
    (d) => !removed.has(d.from) && !changed.has(d.from),
  );

  const symbols = [...retainedSymbols, ...input.delta.symbols];
  const dependencies = [...retainedDeps, ...input.delta.dependencies];

  const parserStats = { ...input.base.parserStats };
  for (const [key, value] of Object.entries(input.delta.parserStats)) {
    if (key === "total" || key === "skipped" || key === "treesitter") {
      parserStats[key] = (parserStats[key] ?? 0) + (value as number);
    } else if (typeof value === "number") {
      parserStats[key as keyof typeof parserStats] =
        ((parserStats[key as keyof typeof parserStats] as number) ?? 0) + value;
    }
  }

  const sourceFilesTotal = Math.max(input.filesTotal, 1);
  const filesParsed = input.delta.parserStats.total;
  const filesSkipped = Math.max(0, sourceFilesTotal - filesParsed);
  const computeUnitsFull = sourceFilesTotal;
  const computeUnitsActual = filesParsed;
  const savingsPercent =
    computeUnitsFull > 0
      ? Math.round(((computeUnitsFull - computeUnitsActual) / computeUnitsFull) * 1000) / 10
      : 0;

  return {
    result: { symbols, dependencies, parserStats },
    metrics: {
      mode: "incremental",
      filesTotal: sourceFilesTotal,
      filesParsed,
      filesSkipped,
      computeUnitsFull,
      computeUnitsActual,
      savingsPercent,
      changeRatio: input.diff.changeRatio,
      meetsSavingsTarget:
        input.diff.changeRatio <= 0.1 ? savingsPercent >= INCREMENTAL_SAVINGS_TARGET_PERCENT : undefined,
    },
  };
}

/** Compare symbol records for incremental equivalence (unchanged files must match exactly). */
export function symbolsEquivalent(a: SymbolRecord, b: SymbolRecord): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.filePath === b.filePath &&
    a.line === b.line &&
    a.lineEnd === b.lineEnd &&
    a.confidence === b.confidence &&
    JSON.stringify(a.evidenceChain) === JSON.stringify(b.evidenceChain)
  );
}

/**
 * Verify symbols on unchanged files are identical between full (base) and incremental merge.
 */
export function verifyUnchangedFileEquivalence(
  base: ParseSlice,
  merged: ParseSlice,
  diff: SnapshotDiff,
): { equal: boolean; mismatches: string[] } {
  const changed = changedFilePaths(diff);
  const mismatches: string[] = [];

  const baseByPath = new Map<string, SymbolRecord[]>();
  for (const symbol of base.symbols) {
    if (changed.has(symbol.filePath)) continue;
    const list = baseByPath.get(symbol.filePath) ?? [];
    list.push(symbol);
    baseByPath.set(symbol.filePath, list);
  }

  const mergedByPath = new Map<string, SymbolRecord[]>();
  for (const symbol of merged.symbols) {
    if (changed.has(symbol.filePath)) continue;
    const list = mergedByPath.get(symbol.filePath) ?? [];
    list.push(symbol);
    mergedByPath.set(symbol.filePath, list);
  }

  for (const [filePath, baseSymbols] of baseByPath) {
    const mergedSymbols = mergedByPath.get(filePath);
    if (!mergedSymbols || mergedSymbols.length !== baseSymbols.length) {
      mismatches.push(`${filePath}: symbol count differs`);
      continue;
    }
    const sortedBase = [...baseSymbols].sort((a, b) => a.id.localeCompare(b.id));
    const sortedMerged = [...mergedSymbols].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sortedBase.length; i++) {
      if (!symbolsEquivalent(sortedBase[i]!, sortedMerged[i]!)) {
        mismatches.push(`${filePath}: symbol ${sortedBase[i]!.id} differs after incremental merge`);
      }
    }
  }

  return { equal: mismatches.length === 0, mismatches };
}

export function fullAnalysisMetrics(filesTotal: number): IncrementalComputeMetrics {
  return {
    mode: "full",
    filesTotal,
    filesParsed: filesTotal,
    filesSkipped: 0,
    computeUnitsFull: filesTotal,
    computeUnitsActual: filesTotal,
    savingsPercent: 0,
    changeRatio: 1,
  };
}