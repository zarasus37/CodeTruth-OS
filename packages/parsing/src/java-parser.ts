import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";
import { endLineOf, lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

export function parseJavaFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const treeCtx = { ...ctx, engine: "treesitter" as const, parserEngine: "java" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("java", content);
  if (!root) return { symbols, dependencies };

  walkTree(root, (node) => {
    if (node.type === "class_declaration") {
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

    if (node.type === "method_declaration") {
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

    if (node.type === "import_declaration") {
      let importPath: string | undefined;
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child?.type === "scoped_identifier" || child?.type === "identifier") {
          importPath = child.text;
          break;
        }
      }
      if (importPath && importPath !== "static") {
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: importPath,
            kind: "imports",
            line: lineOf(node),
          }),
        );
        const shortName = importPath.split(".").pop() ?? importPath;
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name: shortName,
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