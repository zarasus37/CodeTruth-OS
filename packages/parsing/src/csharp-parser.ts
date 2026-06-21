import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";
import { endLineOf, lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

function parseCSharpPattern(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const patternCtx = { ...ctx, engine: "pattern" as const, parserEngine: "csharp-pattern" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    const classMatch = line.match(
      /^\s*(?:public\s+)?(?:partial\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\b/,
    );
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

    const interfaceMatch = line.match(/^\s*(?:public\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (interfaceMatch?.[1]) {
      symbols.push(
        makeSymbol({
          ctx: patternCtx,
          name: interfaceMatch[1],
          kind: "interface",
          filePath,
          line: lineNo,
        }),
      );
    }

    const usingMatch = line.match(/^\s*using\s+([A-Za-z0-9_.]+)\s*;/);
    if (usingMatch?.[1]) {
      dependencies.push(
        makeDependency({
          ctx: patternCtx,
          from: filePath,
          to: usingMatch[1],
          kind: "imports",
          line: lineNo,
        }),
      );
    }
  }

  return { symbols, dependencies };
}

export function parseCSharpFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const treeCtx = { ...ctx, engine: "treesitter" as const, parserEngine: "csharp" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("csharp", content);
  if (!root) return parseCSharpPattern(filePath, content, ctx);

  walkTree(root, (node) => {
    if (node.type === "class_declaration" || node.type === "struct_declaration") {
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

    if (node.type === "interface_declaration") {
      const name = nodeName(node);
      if (name) {
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name,
            kind: "interface",
            filePath,
            line: lineOf(node),
            lineEnd: endLineOf(node),
          }),
        );
      }
    }

    if (node.type === "method_declaration" || node.type === "constructor_declaration") {
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

    if (node.type === "using_directive") {
      const nameNode = node.namedChild(0);
      const importName = nameNode?.text;
      if (importName) {
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: importName,
            kind: "imports",
            line: lineOf(node),
          }),
        );
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name: importName.split(".").pop() ?? importName,
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