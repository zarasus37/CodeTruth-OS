import { createId } from "@codetruth/core";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

function parseRubyHeuristic(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;
    const defMatch = line.match(/^\s*def\s+(?:self\.)?([A-Za-z_][A-Za-z0-9_!?]*)/);
    if (defMatch?.[1]) {
      symbols.push({ id: createId("sym"), name: defMatch[1], kind: "function", filePath, line: lineNo });
    }
    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_:]*)/);
    if (classMatch?.[1]) {
      symbols.push({ id: createId("sym"), name: classMatch[1], kind: "class", filePath, line: lineNo });
    }
  }

  return { symbols, dependencies };
}

export function parseRubyFile(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("ruby", content);
  if (!root) return parseRubyHeuristic(filePath, content);

  walkTree(root, (node) => {
    if (node.type === "method") {
      const name = nodeName(node);
      if (name) {
        symbols.push({
          id: createId("sym"),
          name,
          kind: "function",
          filePath,
          line: lineOf(node),
        });
      }
    }

    if (node.type === "class" || node.type === "module") {
      const name = nodeName(node);
      if (name) {
        symbols.push({
          id: createId("sym"),
          name,
          kind: node.type === "class" ? "class" : "type",
          filePath,
          line: lineOf(node),
        });
      }
    }

    if (node.type === "call" && node.childForFieldName("method")?.text === "require") {
      const arg = node.namedChild(node.namedChildCount - 1);
      const req = arg?.text?.replace(/^['"]|['"]$/g, "");
      if (req) {
        dependencies.push({ from: filePath, to: req, kind: "imports" });
      }
    }
  });

  return { symbols, dependencies };
}