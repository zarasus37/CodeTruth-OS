import { parse } from "@babel/parser";
import traverseModule, { type Visitor } from "@babel/traverse";
import type { Node } from "@babel/types";
import { createId } from "@codetruth/core";

type TraverseFn = (ast: Node, visitor: Visitor) => void;

const traverse: TraverseFn =
  typeof traverseModule === "function"
    ? (traverseModule as TraverseFn)
    : (traverseModule as { default: TraverseFn }).default;
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";

function babelPlugins(filePath: string) {
  const plugins = ["importAttributes"] as Array<
    "importAttributes" | "typescript" | "jsx"
  >;
  if (/\.tsx?$/i.test(filePath)) {
    plugins.push("typescript", "jsx");
  }
  return plugins;
}

export function parseWithBabel(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];

  let ast;
  try {
    ast = parse(content, {
      sourceType: "module",
      plugins: babelPlugins(filePath),
      errorRecovery: true,
      allowReturnOutsideFunction: true,
    });
  } catch {
    return { symbols, dependencies };
  }

  const visitor: Visitor = {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;
      symbols.push({
        id: createId("sym"),
        name,
        kind: "function",
        filePath,
        line: path.node.loc?.start.line,
      });
    },
    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;
      symbols.push({
        id: createId("sym"),
        name,
        kind: "class",
        filePath,
        line: path.node.loc?.start.line,
      });
    },
    TSInterfaceDeclaration(path) {
      symbols.push({
        id: createId("sym"),
        name: path.node.id.name,
        kind: "interface",
        filePath,
        line: path.node.loc?.start.line,
      });
    },
    TSTypeAliasDeclaration(path) {
      symbols.push({
        id: createId("sym"),
        name: path.node.id.name,
        kind: "type",
        filePath,
        line: path.node.loc?.start.line,
      });
    },
    ExportNamedDeclaration(path) {
      const decl = path.node.declaration;
      if (!decl) return;
      if (decl.type === "FunctionDeclaration" && decl.id?.name) {
        symbols.push({
          id: createId("sym"),
          name: decl.id.name,
          kind: "export",
          filePath,
          line: decl.loc?.start.line,
        });
      }
      if (decl.type === "ClassDeclaration" && decl.id?.name) {
        symbols.push({
          id: createId("sym"),
          name: decl.id.name,
          kind: "export",
          filePath,
          line: decl.loc?.start.line,
        });
      }
    },
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (typeof source !== "string") return;
      dependencies.push({ from: filePath, to: source, kind: "imports" });
      for (const spec of path.node.specifiers) {
        const local = "local" in spec ? spec.local.name : source;
        symbols.push({
          id: createId("sym"),
          name: local,
          kind: "import",
          filePath,
          line: path.node.loc?.start.line,
        });
      }
    },
    CallExpression(path) {
      if (path.node.callee.type === "Identifier") {
        dependencies.push({
          from: filePath,
          to: path.node.callee.name,
          kind: "calls",
        });
      }
    },
  };

  traverse(ast, visitor);

  return { symbols, dependencies };
}