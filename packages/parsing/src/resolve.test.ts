import { describe, expect, it } from "vitest";
import { makeDependency, makeSymbol } from "./evidence.js";
import { linkImportSymbols, resolveCrossFileDependencies } from "./resolve.js";

const ctx = { snapshotHash: "h", engine: "babel" as const, parserEngine: "babel" };

describe("resolveCrossFileDependencies", () => {
  it("resolves relative imports to manifest paths", () => {
    const dep = makeDependency({
      ctx,
      from: "src/app.ts",
      to: "./foo",
      kind: "imports",
      line: 1,
    });
    const resolved = resolveCrossFileDependencies([dep], ["src/app.ts", "src/foo.ts"]);
    expect(resolved[0]?.resolvedTo).toBe("src/foo.ts");
    expect(resolved[0]?.confidence).toBe("Confirmed");
    expect(resolved[0]?.evidenceChain.length).toBeGreaterThan(1);
  });
});

describe("linkImportSymbols", () => {
  it("links import symbols to exported definitions in resolved files", () => {
    const exported = makeSymbol({
      ctx,
      name: "foo",
      kind: "export",
      filePath: "src/foo.ts",
      line: 5,
    });
    const imported = makeSymbol({
      ctx,
      name: "foo",
      kind: "import",
      filePath: "src/app.ts",
      line: 1,
    });
    const dep = makeDependency({
      ctx,
      from: "src/app.ts",
      to: "./foo",
      kind: "imports",
      line: 1,
      resolvedTo: "src/foo.ts",
    });

    const linked = linkImportSymbols([exported, imported], [dep]);
    const linkedImport = linked.find((s) => s.id === imported.id);
    expect(linkedImport?.evidenceChain.length).toBeGreaterThan(1);
    expect(linkedImport?.confidence).toBe("Confirmed");
  });
});