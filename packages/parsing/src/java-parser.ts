import { createId } from "@codetruth/core";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

export function parseJavaFile(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("java", content);
  if (!root) return { symbols, dependencies };

  walkTree(root, (node) => {
    if (node.type === "class_declaration") {
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

    if (node.type === "interface_declaration") {
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

    if (node.type === "method_declaration") {
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
        dependencies.push({ from: filePath, to: importPath, kind: "imports" });
        const shortName = importPath.split(".").pop() ?? importPath;
        symbols.push({
          id: createId("sym"),
          name: shortName,
          kind: "import",
          filePath,
          line: lineOf(node),
        });
      }
    }
  });

  return { symbols, dependencies };
}