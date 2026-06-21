import { createId } from "@codetruth/core";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { lineOf, nodeName, parseTree, walkTree } from "./tree-sitter-runtime.js";

function parseCSharpHeuristic(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
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
      symbols.push({ id: createId("sym"), name: classMatch[1], kind: "class", filePath, line: lineNo });
    }

    const interfaceMatch = line.match(/^\s*(?:public\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (interfaceMatch?.[1]) {
      symbols.push({
        id: createId("sym"),
        name: interfaceMatch[1],
        kind: "interface",
        filePath,
        line: lineNo,
      });
    }

    const usingMatch = line.match(/^\s*using\s+([A-Za-z0-9_.]+)\s*;/);
    if (usingMatch?.[1]) {
      dependencies.push({ from: filePath, to: usingMatch[1], kind: "imports" });
    }
  }

  return { symbols, dependencies };
}

export function parseCSharpFile(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const root = parseTree("csharp", content);
  if (!root) return parseCSharpHeuristic(filePath, content);

  walkTree(root, (node) => {
    if (node.type === "class_declaration" || node.type === "struct_declaration") {
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

    if (node.type === "method_declaration" || node.type === "constructor_declaration") {
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

    if (node.type === "using_directive") {
      const nameNode = node.namedChild(0);
      const importName = nameNode?.text;
      if (importName) {
        dependencies.push({ from: filePath, to: importName, kind: "imports" });
        symbols.push({
          id: createId("sym"),
          name: importName.split(".").pop() ?? importName,
          kind: "import",
          filePath,
          line: lineOf(node),
        });
      }
    }
  });

  return { symbols, dependencies };
}