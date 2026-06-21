import { describe, expect, it } from "vitest";
import { parsePythonFile } from "./python-parser.js";

describe("parsePythonFile", () => {
  it("extracts python defs and imports", () => {
    const source = `import os\nfrom utils import helper\n\nclass Worker:\n    pass\n\ndef run():\n    pass\n`;
    const result = parsePythonFile("app.py", source, {
      snapshotHash: "snap_1",
      engine: "treesitter",
      parserEngine: "python",
    });
    expect(result.symbols.some((s) => s.name === "Worker")).toBe(true);
    expect(result.symbols.some((s) => s.name === "run")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "utils")).toBe(true);
    expect(result.symbols.every((s) => s.evidenceChain.length >= 1)).toBe(true);

    const runFn = result.symbols.find((s) => s.name === "run");
    expect(runFn?.evidenceChain[0]?.rawSnippet).toContain("def run");
    expect(["AST", "pattern_match"]).toContain(runFn?.evidenceChain[0]?.extractionMethod);

    const worker = result.symbols.find((s) => s.name === "Worker");
    expect(worker?.evidenceChain[0]?.rawSnippet).toContain("class Worker");

    const utilsImport = result.dependencies.find((d) => d.to === "utils");
    expect(utilsImport?.evidenceChain[0]?.rawSnippet).toContain("utils");
  });
});