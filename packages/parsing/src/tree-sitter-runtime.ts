import Parser from "tree-sitter";
import type { SyntaxNode } from "tree-sitter";
import CSharp from "tree-sitter-c-sharp";
import Go from "tree-sitter-go";
import Java from "tree-sitter-java";
import Python from "tree-sitter-python";
import Ruby from "tree-sitter-ruby";
import Rust from "tree-sitter-rust";

type TreeSitterLanguage = Parameters<Parser["setLanguage"]>[0];

const parsers = new Map<string, Parser>();

function getParser(language: TreeSitterLanguage, key: string): Parser {
  let parser = parsers.get(key);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(language);
    parsers.set(key, parser);
  }
  return parser;
}

const LANGUAGE_MODULES = {
  go: Go,
  rust: Rust,
  java: Java,
  csharp: CSharp,
  ruby: Ruby,
  python: Python,
} as const;

export type TreeSitterLanguageKey = keyof typeof LANGUAGE_MODULES;

export function parseTree(language: TreeSitterLanguageKey, content: string): SyntaxNode | null {
  try {
    const lang = LANGUAGE_MODULES[language] as TreeSitterLanguage;
    const parser = getParser(lang, language);
    return parser.parse(content).rootNode;
  } catch {
    return null;
  }
}

export function nodeName(node: SyntaxNode, field = "name"): string | undefined {
  const child = node.childForFieldName(field);
  if (child?.type === "identifier" || child?.type === "type_identifier") {
    return child.text;
  }
  return child?.text;
}

export function lineOf(node: SyntaxNode): number {
  return node.startPosition.row + 1;
}

export function endLineOf(node: SyntaxNode): number {
  return node.endPosition.row + 1;
}

/** Verbatim source text for a tree-sitter node (preferred for rawSnippet). */
export function nodeSnippet(node: SyntaxNode, maxLength = 1200): string {
  const text = node.text?.trim() ?? "";
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/** Slice source lines when only line numbers are available (pattern fallback). */
export function sliceSourceLines(
  content: string,
  lineStart: number,
  lineEnd?: number,
  maxLength = 1200,
): string {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, lineStart - 1);
  const end = lineEnd != null ? Math.min(lines.length, lineEnd) : start + 1;
  const text = lines.slice(start, end).join("\n").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function walkTree(node: SyntaxNode, visit: (node: SyntaxNode) => void): void {
  visit(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) walkTree(child, visit);
  }
}