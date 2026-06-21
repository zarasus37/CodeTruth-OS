import { parse } from "@babel/parser";
import traverseModule, { type Visitor } from "@babel/traverse";
import type { Node } from "@babel/types";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";
import { makeDependency, makeSymbol, type ParseEvidenceContext } from "./evidence.js";

type TraverseFn = (ast: Node, visitor: Visitor) => void;

const traverse: TraverseFn =
  typeof traverseModule === "function"
    ? (traverseModule as TraverseFn)
    : (traverseModule as { default: TraverseFn }).default;

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
  ctx: ParseEvidenceContext,
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
      symbols.push(
        makeSymbol({
          ctx,
          name,
          kind: "function",
          filePath,
          line: path.node.loc?.start.line,
          lineEnd: path.node.loc?.end.line,
          columnStart: path.node.loc?.start.column,
          columnEnd: path.node.loc?.end.column,
        }),
      );
    },
    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;
      symbols.push(
        makeSymbol({
          ctx,
          name,
          kind: "class",
          filePath,
          line: path.node.loc?.start.line,
          lineEnd: path.node.loc?.end.line,
        }),
      );
    },
    TSInterfaceDeclaration(path) {
      symbols.push(
        makeSymbol({
          ctx,
          name: path.node.id.name,
          kind: "interface",
          filePath,
          line: path.node.loc?.start.line,
          lineEnd: path.node.loc?.end.line,
        }),
      );
    },
    TSTypeAliasDeclaration(path) {
      symbols.push(
        makeSymbol({
          ctx,
          name: path.node.id.name,
          kind: "type",
          filePath,
          line: path.node.loc?.start.line,
          lineEnd: path.node.loc?.end.line,
        }),
      );
    },
    ExportNamedDeclaration(path) {
      const decl = path.node.declaration;
      if (!decl) return;
      if (decl.type === "FunctionDeclaration" && decl.id?.name) {
        symbols.push(
          makeSymbol({
            ctx,
            name: decl.id.name,
            kind: "export",
            filePath,
            line: decl.loc?.start.line,
            lineEnd: decl.loc?.end.line,
          }),
        );
      }
      if (decl.type === "ClassDeclaration" && decl.id?.name) {
        symbols.push(
          makeSymbol({
            ctx,
            name: decl.id.name,
            kind: "export",
            filePath,
            line: decl.loc?.start.line,
            lineEnd: decl.loc?.end.line,
          }),
        );
      }
    },
    ImportDeclaration(path) {
      const source = path.node.source.value;
      if (typeof source !== "string") return;
      dependencies.push(
        makeDependency({
          ctx,
          from: filePath,
          to: source,
          kind: "imports",
          line: path.node.loc?.start.line,
        }),
      );
      for (const spec of path.node.specifiers) {
        const local = "local" in spec ? spec.local.name : source;
        symbols.push(
          makeSymbol({
            ctx,
            name: local,
            kind: "import",
            filePath,
            line: path.node.loc?.start.line,
            snippet: `import ${local} from '${source}'`,
          }),
        );
      }
    },
    CallExpression(path) {
      if (path.node.callee.type === "Identifier") {
        dependencies.push(
          makeDependency({
            ctx,
            from: filePath,
            to: path.node.callee.name,
            kind: "calls",
            line: path.node.loc?.start.line,
            snippet: `call ${path.node.callee.name}()`,
          }),
        );
      }
    },
  };

  traverse(ast, visitor);

  return { symbols, dependencies };
}