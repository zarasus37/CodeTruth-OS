import { describe, expect, it } from "vitest";
import { parseRustFile } from "./rust-parser.js";

describe("parseRustFile (tree-sitter)", () => {
  it("extracts functions, structs, and use declarations", () => {
    const content = `use std::io;
fn main() {}
struct App {}
trait Handler {}
`;
    const result = parseRustFile("lib.rs", content, {
      snapshotHash: "snap_1",
      engine: "treesitter",
      parserEngine: "rust",
    });
    expect(result.symbols.some((s) => s.name === "main")).toBe(true);
    expect(result.symbols.some((s) => s.name === "App")).toBe(true);
    expect(result.symbols.some((s) => s.name === "Handler")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "std")).toBe(true);
    expect(result.symbols.every((s) => s.evidenceChain.length >= 1)).toBe(true);

    const main = result.symbols.find((s) => s.name === "main");
    expect(main?.evidenceChain[0]?.rawSnippet).toContain("fn main");
    expect(main?.evidenceChain[0]?.extractionMethod).toBe("AST");

    const app = result.symbols.find((s) => s.name === "App");
    expect(app?.evidenceChain[0]?.rawSnippet).toContain("struct App");

    const handler = result.symbols.find((s) => s.name === "Handler");
    expect(handler?.evidenceChain[0]?.rawSnippet).toContain("trait Handler");

    const stdImport = result.dependencies.find((d) => d.to === "std");
    expect(stdImport?.evidenceChain[0]?.rawSnippet).toContain("std");
  });
});