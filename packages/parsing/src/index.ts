import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DependencyEdge, ParserStats, SnapshotRecord, SymbolRecord } from "@codetruth/core";
import { parseWithBabel } from "./babel-parser.js";
import { parseCSharpFile } from "./csharp-parser.js";
import { type ParseEvidenceContext } from "./evidence.js";
import { parseGoFile } from "./go-parser.js";
import { parseJavaFile } from "./java-parser.js";
import { detectParserEngine, emptyParserStats, isSourceFile } from "./languages.js";
import { parsePythonFile } from "./python-parser.js";
import { parseRubyFile } from "./ruby-parser.js";
import { parseRustFile } from "./rust-parser.js";
import { linkImportSymbols, resolveCrossFileDependencies } from "./resolve.js";

export { detectLanguage, detectParserEngine, isSourceFile } from "./languages.js";
export { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";

export interface ParseFileFailure {
  path: string;
  error: string;
}

export interface ParseResult {
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  parserStats: ParserStats;
  failedFiles?: ParseFileFailure[];
}

function buildEvidenceContext(snapshot: SnapshotRecord, engine: string): ParseEvidenceContext {
  return {
    snapshotHash: snapshot.hash,
    engine: engine === "babel" ? "babel" : engine === "python" ? "treesitter" : "treesitter",
    parserEngine: engine,
  };
}

function parseFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): {
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  engine: keyof Omit<ParserStats, "total">;
  usedTreesitter: boolean;
} {
  const engine = detectParserEngine(filePath);
  switch (engine) {
    case "python":
      return { ...parsePythonFile(filePath, content, ctx), engine: "python", usedTreesitter: true };
    case "babel":
      return { ...parseWithBabel(filePath, content, { ...ctx, engine: "babel", parserEngine: "babel" }), engine: "babel", usedTreesitter: false };
    case "go":
      return { ...parseGoFile(filePath, content, ctx), engine: "go", usedTreesitter: true };
    case "rust":
      return { ...parseRustFile(filePath, content, ctx), engine: "rust", usedTreesitter: true };
    case "java":
      return { ...parseJavaFile(filePath, content, ctx), engine: "java", usedTreesitter: true };
    case "csharp":
      return { ...parseCSharpFile(filePath, content, ctx), engine: "csharp", usedTreesitter: true };
    case "ruby":
      return { ...parseRubyFile(filePath, content, ctx), engine: "ruby", usedTreesitter: true };
    default:
      return { symbols: [], dependencies: [], engine: "skipped", usedTreesitter: false };
  }
}

function finalizeParseResult(
  snapshot: SnapshotRecord,
  symbols: SymbolRecord[],
  dependencies: DependencyEdge[],
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const manifestPaths = snapshot.manifest.map((entry) => entry.path);
  const resolvedDeps = resolveCrossFileDependencies(dependencies, manifestPaths);
  const linkedSymbols = linkImportSymbols(symbols, resolvedDeps);
  return { symbols: linkedSymbols, dependencies: resolvedDeps };
}

export async function parseSnapshotPaths(
  snapshot: SnapshotRecord,
  paths: Set<string>,
): Promise<ParseResult> {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const parserStats = emptyParserStats();
  const failedFiles: ParseFileFailure[] = [];

  for (const entry of snapshot.manifest) {
    if (!paths.has(entry.path)) continue;
    if (!isSourceFile(entry.path)) continue;
    const fullPath = path.join(snapshot.rootPath, entry.path);
    let content = "";
    try {
      content = await readFile(fullPath, "utf8");
    } catch (error) {
      parserStats.skipped += 1;
      failedFiles.push({
        path: entry.path,
        error: error instanceof Error ? error.message : "read failed",
      });
      continue;
    }

    const engine = detectParserEngine(entry.path);
    const ctx = buildEvidenceContext(snapshot, engine);

    let parsed;
    try {
      parsed = parseFile(entry.path, content, ctx);
    } catch (error) {
      parserStats.skipped += 1;
      failedFiles.push({
        path: entry.path,
        error: error instanceof Error ? error.message : "parse failed",
      });
      continue;
    }

    symbols.push(...parsed.symbols);
    dependencies.push(...parsed.dependencies);
    parserStats[parsed.engine] += 1;
    if (parsed.usedTreesitter) {
      parserStats.treesitter += 1;
    }
    parserStats.total += 1;
  }

  const finalized = finalizeParseResult(snapshot, symbols, dependencies);

  return {
    symbols: finalized.symbols,
    dependencies: finalized.dependencies,
    parserStats,
    failedFiles: failedFiles.length ? failedFiles : undefined,
  };
}

export async function parseSnapshot(snapshot: SnapshotRecord): Promise<ParseResult> {
  const paths = new Set(snapshot.manifest.map((entry) => entry.path));
  return parseSnapshotPaths(snapshot, paths);
}

export function countSourceFiles(snapshot: SnapshotRecord): number {
  return snapshot.manifest.filter((entry) => isSourceFile(entry.path)).length;
}