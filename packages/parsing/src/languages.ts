export type ParserEngine =
  | "babel"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "csharp"
  | "ruby"
  | "skipped";

const EXTENSION_MAP: Array<[RegExp, ParserEngine]> = [
  [/\.py$/i, "python"],
  [/\.(ts|tsx|js|jsx|mjs|cjs)$/i, "babel"],
  [/\.go$/i, "go"],
  [/\.rs$/i, "rust"],
  [/\.java$/i, "java"],
  [/\.cs$/i, "csharp"],
  [/\.rb$/i, "ruby"],
];

export function detectParserEngine(filePath: string): ParserEngine {
  for (const [pattern, engine] of EXTENSION_MAP) {
    if (pattern.test(filePath)) return engine;
  }
  return "skipped";
}

export function detectLanguage(filePath: string): string | undefined {
  const engine = detectParserEngine(filePath);
  if (engine === "skipped") return undefined;
  if (engine === "babel") return /\.tsx?$/i.test(filePath) ? "typescript" : "javascript";
  return engine;
}

export function isSourceFile(filePath: string): boolean {
  return detectParserEngine(filePath) !== "skipped";
}

export function emptyParserStats() {
  return {
    babel: 0,
    python: 0,
    go: 0,
    rust: 0,
    java: 0,
    csharp: 0,
    ruby: 0,
    treesitter: 0,
    skipped: 0,
    total: 0,
  };
}