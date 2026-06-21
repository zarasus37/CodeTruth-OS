import { describe, expect, it } from "vitest";
import { parseGoFile } from "./go-parser.js";

describe("parseGoFile", () => {
  it("extracts functions, types, and imports", () => {
    const content = `package main
import "fmt"
func Hello() {}
type User struct {}
`;
    const result = parseGoFile("main.go", content);
    expect(result.symbols.some((s) => s.name === "Hello" && s.kind === "function")).toBe(true);
    expect(result.symbols.some((s) => s.name === "User")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "fmt")).toBe(true);
  });
});