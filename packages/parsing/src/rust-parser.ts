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

export function parseRustFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const treeCtx = { ...ctx, engine: "treesitter" as const, parserEngine: "rust" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("rust", content);
  if (!root) return { symbols, dependencies };

  walkTree(root, (node) => {
    if (node.type === "function_item") {
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

    if (node.type === "struct_item") {
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
            snippet: nodeSnippet(node),
          }),
        );
      }
    }

    if (node.type === "trait_item") {
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
            snippet: nodeSnippet(node),
          }),
        );
      }
    }

    if (node.type === "mod_item") {
      const name = nodeName(node);
      if (name) {
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name,
            kind: "export",
            filePath,
            line: lineOf(node),
            lineEnd: endLineOf(node),
            snippet: nodeSnippet(node),
          }),
        );
      }
    }

    if (node.type === "use_declaration") {
      const pathNode = node.childForFieldName("argument");
      const target = pathNode?.text?.split("::")[0]?.trim();
      if (target) {
        const snippet = nodeSnippet(node) || pathNode?.text;
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: target,
            kind: "imports",
            line: lineOf(node),
            snippet,
          }),
        );
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name: target,
            kind: "import",
            filePath,
            line: lineOf(node),
            snippet,
          }),
        );
      }
    }
  });

  return { symbols, dependencies };
}