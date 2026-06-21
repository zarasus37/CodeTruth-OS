import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DependencyEdge, ParserStats, SnapshotRecord, SymbolRecord } from "@codetruth/core";
import { parseWithBabel } from "./babel-parser.js";
import { parseCSharpFile } from "./csharp-parser.js";
import { parseGoFile } from "./go-parser.js";
import { parseJavaFile } from "./java-parser.js";
import { detectParserEngine, emptyParserStats, isSourceFile } from "./languages.js";
import { parsePythonFile } from "./python-parser.js";
import { parseRubyFile } from "./ruby-parser.js";
import { parseRustFile } from "./rust-parser.js";

export { detectLanguage, detectParserEngine, isSourceFile } from "./languages.js";

export interface ParseResult {
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  parserStats: ParserStats;
}

function parseFile(filePath: string, content: string): {
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
  engine: keyof Omit<ParserStats, "total">;
} {
  const engine = detectParserEngine(filePath);
  switch (engine) {
    case "python":
      return { ...parsePythonFile(filePath, content), engine: "python" };
    case "babel":
      return { ...parseWithBabel(filePath, content), engine: "babel" };
    case "go":
      return { ...parseGoFile(filePath, content), engine: "go" };
    case "rust":
      return { ...parseRustFile(filePath, content), engine: "rust" };
    case "java":
      return { ...parseJavaFile(filePath, content), engine: "java" };
    case "csharp":
      return { ...parseCSharpFile(filePath, content), engine: "csharp" };
    case "ruby":
      return { ...parseRubyFile(filePath, content), engine: "ruby" };
    default:
      return { symbols: [], dependencies: [], engine: "skipped" };
  }
}

export async function parseSnapshot(snapshot: SnapshotRecord): Promise<ParseResult> {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const parserStats = emptyParserStats();

  for (const entry of snapshot.manifest) {
    if (!isSourceFile(entry.path)) continue;
    const fullPath = path.join(snapshot.rootPath, entry.path);
    let content = "";
    try {
      content = await readFile(fullPath, "utf8");
    } catch {
      parserStats.skipped += 1;
      continue;
    }

    const parsed = parseFile(entry.path, content);
    symbols.push(...parsed.symbols);
    dependencies.push(...parsed.dependencies);
    parserStats[parsed.engine] += 1;
    if (
      parsed.engine === "go" ||
      parsed.engine === "rust" ||
      parsed.engine === "java" ||
      parsed.engine === "csharp" ||
      parsed.engine === "ruby"
    ) {
      parserStats.treesitter += 1;
    }
    parserStats.total += 1;
  }

  return { symbols, dependencies, parserStats };
}