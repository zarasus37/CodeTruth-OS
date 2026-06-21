import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";
import {
  endLineOf,
  lineOf,
  nodeName,
  nodeSnippet,
  parseTree,
  walkTree,
} from "./tree-sitter-runtime.js";

export function parseGoFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const treeCtx = { ...ctx, engine: "treesitter" as const, parserEngine: "go" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("go", content);
  if (!root) return { symbols, dependencies };

  walkTree(root, (node) => {
    if (node.type === "function_declaration" || node.type === "method_declaration") {
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
            snippet: nodeSnippet(node),
          }),
        );
      }
    }

    if (node.type === "type_declaration") {
      for (let i = 0; i < node.namedChildCount; i++) {
        const spec = node.namedChild(i);
        if (spec?.type !== "type_spec") continue;
        const name = nodeName(spec);
        if (!name) continue;
        const typeNode = spec.childForFieldName("type");
        const kind = typeNode?.type === "interface_type" ? "interface" : "class";
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name,
            kind,
            filePath,
            line: lineOf(spec),
            lineEnd: endLineOf(spec),
            snippet: nodeSnippet(node),
          }),
        );
      }
    }

    if (node.type === "import_declaration") {
      walkTree(node, (importNode) => {
        if (importNode.type !== "import_spec") return;
        const pathNode = importNode.childForFieldName("path");
        const importPath = pathNode?.text?.replace(/^"|"$/g, "");
        if (!importPath) return;
        const snippet = nodeSnippet(importNode) || pathNode?.text;
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: importPath,
            kind: "imports",
            line: lineOf(importNode),
            snippet,
          }),
        );
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name: importPath,
            kind: "import",
            filePath,
            line: lineOf(importNode),
            snippet,
          }),
        );
      });
    }
  });

  return { symbols, dependencies };
}