import { describe, expect, it } from "vitest";
import { parsePythonFile } from "./python-parser.js";

describe("parsePythonFile", () => {
  it("extracts python defs and imports", () => {
    const source = `import os\nfrom utils import helper\n\nclass Worker:\n    pass\n\ndef run():\n    pass\n`;
    const result = parsePythonFile("app.py", source);
    expect(result.symbols.some((s) => s.name === "Worker")).toBe(true);
    expect(result.symbols.some((s) => s.name === "run")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "utils")).toBe(true);
  });
});