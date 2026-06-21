import { createId } from "@codetruth/core";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

export function parseRustFile(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("rust", content);
  if (!root) return { symbols, dependencies };

  walkTree(root, (node) => {
    if (node.type === "function_item") {
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

    if (node.type === "struct_item") {
      const name = nodeName(node);
      if (name) {
        symbols.push({
          id: createId("sym"),
          name,
          kind: "class",
          filePath,
          line: lineOf(node),
        });
      }
    }

    if (node.type === "trait_item") {
      const name = nodeName(node);
      if (name) {
        symbols.push({
          id: createId("sym"),
          name,
          kind: "interface",
          filePath,
          line: lineOf(node),
        });
      }
    }

    if (node.type === "mod_item") {
      const name = nodeName(node);
      if (name) {
        symbols.push({
          id: createId("sym"),
          name,
          kind: "export",
          filePath,
          line: lineOf(node),
        });
      }
    }

    if (node.type === "use_declaration") {
      const pathNode = node.childForFieldName("argument");
      const target = pathNode?.text?.split("::")[0]?.trim();
      if (target) {
        dependencies.push({ from: filePath, to: target, kind: "imports" });
        symbols.push({
          id: createId("sym"),
          name: target,
          kind: "import",
          filePath,
          line: lineOf(node),
        });
      }
    }
  });

  return { symbols, dependencies };
}