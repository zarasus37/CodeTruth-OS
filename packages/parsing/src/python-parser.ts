import { createId } from "@codetruth/core";
import type { DependencyEdge, SymbolRecord } from "@codetruth/core";

export function parsePythonFile(
  filePath: string,
  content: string,
): { symbols: SymbolRecord[]; dependencies: DependencyEdge[] } {
  const symbols: SymbolRecord[] = [];
  const dependencies: DependencyEdge[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    const defMatch = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (defMatch?.[1]) {
      symbols.push({
        id: createId("sym"),
        name: defMatch[1],
        kind: "function",
        filePath,
        line: lineNo,
      });
    }

    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(:]/);
    if (classMatch?.[1]) {
      symbols.push({
        id: createId("sym"),
        name: classMatch[1],
        kind: "class",
        filePath,
        line: lineNo,
      });
    }

    const importMatch = line.match(/^\s*import\s+([A-Za-z0-9_.,\s]+)/);
    if (importMatch?.[1]) {
      for (const mod of importMatch[1].split(",").map((m) => m.trim()).filter(Boolean)) {
        const root = mod.split(".")[0]!;
        dependencies.push({ from: filePath, to: root, kind: "imports" });
        symbols.push({ id: createId("sym"), name: root, kind: "import", filePath, line: lineNo });
      }
    }

    const fromMatch = line.match(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+/);
    if (fromMatch?.[1]) {
      dependencies.push({ from: filePath, to: fromMatch[1], kind: "imports" });
      symbols.push({
        id: createId("sym"),
        name: fromMatch[1],
        kind: "import",
        filePath,
        line: lineNo,
      });
    }
  }

  return { symbols, dependencies };
}