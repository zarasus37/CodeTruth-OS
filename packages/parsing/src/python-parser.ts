import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";
import { endLineOf, lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

function parsePythonPattern(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const patternCtx = { ...ctx, engine: "pattern" as const, parserEngine: "python-pattern" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    const defMatch = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (defMatch?.[1]) {
      symbols.push(
        makeSymbol({
          ctx: patternCtx,
          name: defMatch[1],
          kind: "function",
          filePath,
          line: lineNo,
          snippet: line.trim(),
        }),
      );
    }

    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(:]/);
    if (classMatch?.[1]) {
      symbols.push(
        makeSymbol({
          ctx: patternCtx,
          name: classMatch[1],
          kind: "class",
          filePath,
          line: lineNo,
          snippet: line.trim(),
        }),
      );
    }

    const importMatch = line.match(/^\s*import\s+([A-Za-z0-9_.,\s]+)/);
    if (importMatch?.[1]) {
      for (const mod of importMatch[1].split(",").map((m) => m.trim()).filter(Boolean)) {
        const root = mod.split(".")[0]!;
        dependencies.push(
          makeDependency({
            ctx: patternCtx,
            from: filePath,
            to: root,
            kind: "imports",
            line: lineNo,
          }),
        );
        symbols.push(
          makeSymbol({
            ctx: patternCtx,
            name: root,
            kind: "import",
            filePath,
            line: lineNo,
          }),
        );
      }
    }

    const fromMatch = line.match(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+/);
    if (fromMatch?.[1]) {
      dependencies.push(
        makeDependency({
          ctx: patternCtx,
          from: filePath,
          to: fromMatch[1],
          kind: "imports",
          line: lineNo,
        }),
      );
      symbols.push(
        makeSymbol({
          ctx: patternCtx,
          name: fromMatch[1],
          kind: "import",
          filePath,
          line: lineNo,
        }),
      );
    }
  }

  return { symbols, dependencies };
}

export function parsePythonFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const treeCtx = { ...ctx, engine: "treesitter" as const, parserEngine: "python" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("python", content);
  if (!root) return parsePythonPattern(filePath, content, ctx);

  walkTree(root, (node) => {
    if (node.type === "function_definition") {
      const name = nodeName(node);
      if (name) {
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name,
            kind: "function",
            filePath,
            line: lineOf(node),
            lineEnd: endLineOf(node),
          }),
        );
      }
    }

    if (node.type === "class_definition") {
      const name = nodeName(node);
      if (name) {
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name,
            kind: "class",
            filePath,
            line: lineOf(node),
            lineEnd: endLineOf(node),
          }),
        );
      }
    }

    if (node.type === "import_statement") {
      const nameNode = node.namedChild(0);
      const moduleName = nameNode?.text?.split(".")[0];
      if (moduleName) {
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: moduleName,
            kind: "imports",
            line: lineOf(node),
          }),
        );
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name: moduleName,
            kind: "import",
            filePath,
            line: lineOf(node),
          }),
        );
      }
    }

    if (node.type === "import_from_statement") {
      const moduleNode = node.childForFieldName("module_name");
      const moduleName = moduleNode?.text;
      if (moduleName) {
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: moduleName,
            kind: "imports",
            line: lineOf(node),
          }),
        );
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name: moduleName,
            kind: "import",
            filePath,
            line: lineOf(node),
          }),
        );
      }
    }
  });

  return { symbols, dependencies };
}