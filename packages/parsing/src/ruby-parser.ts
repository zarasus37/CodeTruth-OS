import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";
import { endLineOf, lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

function parseRubyPattern(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const patternCtx = { ...ctx, engine: "pattern" as const, parserEngine: "ruby-pattern" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;
    const defMatch = line.match(/^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z0-9_!?]*)/);
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
    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_:]*)/);
    if (classMatch?.[1]) {
      symbols.push(
        makeSymbol({
          ctx: patternCtx,
          name: classMatch[1],
          kind: "class",
          filePath,
          line: lineNo,
        }),
      );
    }
  }

  return { symbols, dependencies };
}

export function parseRubyFile(
  filePath: string,
  content: string,
  ctx: ParseEvidenceContext,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const treeCtx = { ...ctx, engine: "treesitter" as const, parserEngine: "ruby" };
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("ruby", content);
  if (!root) return parseRubyPattern(filePath, content, ctx);

  walkTree(root, (node) => {
    if (node.type === "method") {
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

    if (node.type === "class" || node.type === "module") {
      const name = nodeName(node);
      if (name) {
        symbols.push(
          makeSymbol({
            ctx: treeCtx,
            name,
            kind: node.type === "class" ? "class" : "type",
            filePath,
            line: lineOf(node),
            lineEnd: endLineOf(node),
          }),
        );
      }
    }

    if (node.type === "call" && node.childForFieldName("method")?.text === "require") {
      const arg = node.namedChild(node.namedChildCount - 1);
      const req = arg?.text?.replace(/^['"]|['"]$/g, "");
      if (req) {
        dependencies.push(
          makeDependency({
            ctx: treeCtx,
            from: filePath,
            to: req,
            kind: "imports",
            line: lineOf(node),
          }),
        );
      }
    }
  });

  return { symbols, dependencies };
}