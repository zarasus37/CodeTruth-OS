import { describe, expect, it } from "vitest";
import { parseRustFile } from "./rust-parser.js";

describe("parseRustFile (tree-sitter)", () => {
  it("extracts functions, structs, and use declarations", () => {
    const content = `use std::io;
fn main() {}
struct App {}
trait Handler {}
`;
    const result = parseRustFile("lib.rs", content);
    expect(result.symbols.some((s) => s.name === "main")).toBe(true);
    expect(result.symbols.some((s) => s.name === "App")).toBe(true);
    expect(result.symbols.some((s) => s.name === "Handler")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "std")).toBe(true);
  });
});