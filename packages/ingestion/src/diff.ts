import type {
  FileManifestEntry,
  LanguageDiffStats,
  SnapshotDiff,
  SnapshotRecord,
  SymbolDiffEntry,
  SymbolRecord,
} from "@codetruth/core";
import { detectLanguage } from "@codetruth/parsing";

function languageForPath(filePath: string): string {
  return detectLanguage(filePath) ?? "other";
}

function symbolKey(sym: SymbolRecord): string {
  return `${sym.filePath}::${sym.kind}::${sym.name}`;
}

export function diffSymbols(base: SymbolRecord[], target: SymbolRecord[]): SymbolDiffEntry[] {
  const baseMap = new Map(base.map((s) => [symbolKey(s), s]));
  const targetMap = new Map(target.map((s) => [symbolKey(s), s]));
  const changes: SymbolDiffEntry[] = [];

  for (const [key, sym] of targetMap) {
    if (!baseMap.has(key)) {
      changes.push({
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
      changes.push({
        name: sym.name,
        kind: sym.kind,
        filePath: sym.filePath,
        change: "removed",
        line: sym.line,
      });
    }
  }

  for (const [key, targetSym] of targetMap) {
    const baseSym = baseMap.get(key);
    if (baseSym && baseSym.line !== targetSym.line) {
      changes.push({
        name: targetSym.name,
        kind: targetSym.kind,
        filePath: targetSym.filePath,
        change: "modified",
        line: targetSym.line,
      });
    }
  }

  return changes.slice(0, 500);
}

function languageBreakdown(
  base: SnapshotRecord,
  target: SnapshotRecord,
  added: FileManifestEntry[],
  removed: FileManifestEntry[],
  modified: SnapshotDiff["modified"],
  unchanged: number,
): LanguageDiffStats[] {
  const langs = new Set<string>();
  for (const entry of [...base.manifest, ...target.manifest]) {
    langs.add(languageForPath(entry.path));
  }

  const stats = new Map<string, LanguageDiffStats>();
  for (const lang of langs) {
    stats.set(lang, { language: lang, added: 0, removed: 0, modified: 0, unchanged: 0 });
  }

  for (const entry of added) {
    const lang = languageForPath(entry.path);
    stats.get(lang)!.added += 1;
  }
  for (const entry of removed) {
    const lang = languageForPath(entry.path);
    stats.get(lang)!.removed += 1;
  }
  for (const entry of modified) {
    const lang = languageForPath(entry.path);
    stats.get(lang)!.modified += 1;
  }

  if (unchanged > 0) {
    const other = stats.get("other") ?? {
      language: "other",
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
    };
    other.unchanged = unchanged;
    stats.set("other", other);
  }

  return [...stats.values()].filter(
    (s) => s.added + s.removed + s.modified + s.unchanged > 0,
  );
}

function driftScore(
  fileChangeRatio: number,
  symbolChanges: SymbolDiffEntry[],
  baseSymbolCount: number,
  targetSymbolCount: number,
): number {
  const symbolTotal = Math.max(baseSymbolCount, targetSymbolCount, 1);
  const symbolRatio = symbolChanges.length / symbolTotal;
  const score = fileChangeRatio * 0.55 + symbolRatio * 0.45;
  return Math.round(Math.min(1, score) * 1000) / 1000;
}

export interface DiffSnapshotsOptions {
  baseSymbols?: SymbolRecord[];
  targetSymbols?: SymbolRecord[];
}

export function diffSnapshots(
  base: SnapshotRecord,
  target: SnapshotRecord,
  options: DiffSnapshotsOptions = {},
): SnapshotDiff {
  const baseMap = new Map(base.manifest.map((e) => [e.path, e]));
  const targetMap = new Map(target.manifest.map((e) => [e.path, e]));

  const added: FileManifestEntry[] = [];
  const removed: FileManifestEntry[] = [];
  const modified: SnapshotDiff["modified"] = [];
  let unchanged = 0;

  for (const [filePath, entry] of targetMap) {
    const prior = baseMap.get(filePath);
    if (!prior) {
      added.push(entry);
      continue;
    }
    if (prior.hash !== entry.hash) {
      modified.push({
        path: filePath,
        beforeHash: prior.hash,
        afterHash: entry.hash,
        sizeDelta: entry.size - prior.size,
      });
    } else {
      unchanged += 1;
    }
  }

  for (const [filePath, entry] of baseMap) {
    if (!targetMap.has(filePath)) removed.push(entry);
  }

  const total = Math.max(base.fileCount, target.fileCount, 1);
  const changeRatio = (added.length + removed.length + modified.length) / total;

  const symbolChanges =
    options.baseSymbols && options.targetSymbols
      ? diffSymbols(options.baseSymbols, options.targetSymbols)
      : undefined;

  const langStats = languageBreakdown(base, target, added, removed, modified, unchanged);

  return {
    baseSnapshotId: base.id,
    targetSnapshotId: target.id,
    added,
    removed,
    modified,
    unchanged,
    changeRatio: Math.round(changeRatio * 1000) / 1000,
    languageBreakdown: langStats,
    symbolChanges,
    driftScore:
      symbolChanges !== undefined
        ? driftScore(
            changeRatio,
            symbolChanges,
            options.baseSymbols?.length ?? 0,
            options.targetSymbols?.length ?? 0,
          )
        : Math.round(changeRatio * 1000) / 1000,
  };
}