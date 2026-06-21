import { describe, expect, it } from "vitest";
import { parseGoFile } from "./go-parser.js";

describe("parseGoFile", () => {
  it("extracts functions, types, and imports", () => {
    const content = `package main
import "fmt"
func Hello() {}
type User struct {}
`;
    const result = parseGoFile("main.go", content, {
      snapshotHash: "snap_1",
      engine: "treesitter",
      parserEngine: "go",
    });
    expect(result.symbols.some((s) => s.name === "Hello" && s.kind === "function")).toBe(true);
    expect(result.symbols.some((s) => s.name === "User")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "fmt")).toBe(true);
    expect(result.symbols[0]?.line).toBeGreaterThan(0);
    expect(result.symbols[0]?.confidence).toBe("Confirmed");

    const hello = result.symbols.find((s) => s.name === "Hello");
    expect(hello?.evidenceChain[0]?.rawSnippet).toContain("func Hello");
    expect(hello?.evidenceChain[0]?.extractionMethod).toBe("AST");

    const user = result.symbols.find((s) => s.name === "User");
    expect(user?.evidenceChain[0]?.rawSnippet).toContain("type User");

    const fmtImport = result.dependencies.find((d) => d.to === "fmt");
    expect(fmtImport?.evidenceChain[0]?.rawSnippet).toBeTruthy();
  });
});