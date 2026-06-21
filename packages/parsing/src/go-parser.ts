import { createId } from "@codetruth/core";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

export function parseGoFile(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("go", content);
  if (!root) return { symbols, dependencies };

  walkTree(root, (node) => {
    if (node.type === "function_declaration" || node.type === "method_declaration") {
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

    if (node.type === "type_declaration") {
      for (let i = 0; i < node.namedChildCount; i++) {
        const spec = node.namedChild(i);
        if (spec?.type !== "type_spec") continue;
        const name = nodeName(spec);
        if (!name) continue;
        const typeNode = spec.childForFieldName("type");
        const kind =
          typeNode?.type === "interface_type" ? "interface" : "class";
        symbols.push({
          id: createId("sym"),
          name,
          kind,
          filePath,
          line: lineOf(spec),
        });
      }
    }

    if (node.type === "import_declaration") {
      walkTree(node, (importNode) => {
        if (importNode.type !== "import_spec") return;
        const pathNode = importNode.childForFieldName("path");
        const importPath = pathNode?.text?.replace(/^"|"$/g, "");
        if (!importPath) return;
        dependencies.push({ from: filePath, to: importPath, kind: "imports" });
        symbols.push({
          id: createId("sym"),
          name: importPath,
          kind: "import",
          filePath,
          line: lineOf(importNode),
        });
      });
    }
  });

  return { symbols, dependencies };
}