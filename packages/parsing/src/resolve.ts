import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { mergeConfidence } from "@codetruth/core";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".cs", ".rb"];

function resolveRelativeImport(fromFile: string, target: string, files: Set<string>): string | undefined {
  if (!target.startsWith(".")) return undefined;

  const dir = normalizePath(fromFile).split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") dir.pop();
    else dir.push(segment);
  }

  const base = dir.join("/");
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => `${base}${ext}`),
    ...EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];

  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

export function resolveCrossFileDependencies(
  dependencies: DependencyEdge[],
  manifestPaths: Iterable<string>,
): DependencyEdge[] {
  const files = new Set([...manifestPaths].map(normalizePath));

  return dependencies.map((dep) => {
    if (dep.kind !== "imports" || dep.resolvedTo) return dep;

    const resolvedTo = resolveRelativeImport(dep.from, dep.to, files);
    if (!resolvedTo) return dep;

    const evidence = [
      ...dep.evidenceChain,
      {
        snapshotHash: dep.evidenceChain[0]?.snapshotHash ?? "",
        filePath: resolvedTo,
        extractionMethod: "AST" as const,
        snippet: `Resolved import target: ${dep.to}`,
      },
    ];

    return {
      ...dep,
      resolvedTo,
      confidence: mergeConfidence(dep.confidence, "Confirmed"),
      evidence,
      evidenceChain: evidence,
    };
  });
}

export function linkImportSymbols(
  symbols: SymbolRecord[],
  dependencies: DependencyEdge[],
): SymbolRecord[] {
  const exportsByFile = new Map<string, Map<string, SymbolRecord>>();

  for (const symbol of symbols) {
    if (!["function", "class", "export", "interface", "type"].includes(symbol.kind)) continue;
    const file = normalizePath(symbol.filePath);
    if (!exportsByFile.has(file)) exportsByFile.set(file, new Map());
    exportsByFile.get(file)!.set(symbol.name, symbol);
  }

  const importHints = new Map<string, string>();
  for (const dep of dependencies) {
    if (dep.kind !== "imports" || !dep.resolvedTo) continue;
    const local = dep.to.split("/").pop()?.replace(/\.[^.]+$/, "") ?? dep.to;
    importHints.set(`${normalizePath(dep.from)}:${local}`, normalizePath(dep.resolvedTo));
  }

  return symbols.map((symbol) => {
    if (symbol.kind !== "import") return symbol;
    const hintKey = `${normalizePath(symbol.filePath)}:${symbol.name}`;
    const targetFile = importHints.get(hintKey);
    if (!targetFile) return symbol;

    const exported = exportsByFile.get(targetFile)?.get(symbol.name);
    if (!exported) return symbol;

    const evidence = [
      ...symbol.evidenceChain,
      {
        snapshotHash: symbol.evidenceChain[0]?.snapshotHash ?? "",
        filePath: exported.filePath,
        lineStart: exported.line,
        lineEnd: exported.lineEnd,
        symbolId: exported.id,
        extractionMethod: "AST" as const,
        snippet: `Cross-file symbol link: ${exported.name}`,
      },
    ];

    return {
      ...symbol,
      confidence: mergeConfidence(symbol.confidence, exported.confidence),
      evidence,
      evidenceChain: evidence,
    };
  });
}