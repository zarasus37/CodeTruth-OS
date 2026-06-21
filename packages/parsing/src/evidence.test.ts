import { describe, expect, it } from "vitest";
import { makeDependency, makeSymbol } from "./evidence.js";

const ctx = {
  snapshotHash: "snap_hash",
  engine: "babel" as const,
  parserEngine: "babel",
};

describe("parsing evidence helpers", () => {
  it("creates symbols with confirmed AST confidence", () => {
    const symbol = makeSymbol({
      ctx,
      name: "helper",
      kind: "function",
      filePath: "src/app.ts",
      line: 12,
      lineEnd: 20,
    });
    expect(symbol.confidence).toBe("Confirmed");
    expect(symbol.evidenceChain).toHaveLength(1);
    expect(symbol.evidenceChain[0]?.lineStart).toBe(12);
    expect(symbol.evidenceChain[0]?.extractionMethod).toBe("AST");
  });

  it("assigns weaker confidence to unresolved call edges", () => {
    const dep = makeDependency({
      ctx,
      from: "src/app.ts",
      to: "run",
      kind: "calls",
      line: 30,
    });
    expect(dep.confidence).toBe("Weakly Inferred");
    expect(dep.evidenceChain[0]?.filePath).toBe("src/app.ts");
  });
});