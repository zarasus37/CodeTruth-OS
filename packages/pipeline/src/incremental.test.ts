import { describe, expect, it } from "vitest";
import {
  mergeIncrementalParse,
  symbolsEquivalent,
  verifyUnchangedFileEquivalence,
} from "./incremental.js";

function fixtureSymbol(id: string, name: string, filePath: string) {
  const evidence = [{ snapshotHash: "h", filePath, extractionMethod: "AST" as const }];
  return {
    id,
    name,
    kind: "function" as const,
    filePath,
    confidence: "Confirmed" as const,
    evidence,
    evidenceChain: evidence,
  };
}

const emptyStats = {
  total: 0,
  skipped: 0,
  treesitter: 0,
  babel: 0,
  python: 0,
  go: 0,
  rust: 0,
  java: 0,
  csharp: 0,
  ruby: 0,
};

describe("mergeIncrementalParse", () => {
  it("achieves 85%+ savings when only one file changes in a large snapshot", () => {
    const baseSymbols = Array.from({ length: 100 }, (_, i) =>
      fixtureSymbol(`sym_${i}`, `fn${i}`, `src/file${i}.ts`),
    );

    const merged = mergeIncrementalParse({
      base: {
        symbols: baseSymbols,
        dependencies: [],
        parserStats: { ...emptyStats, total: 100, babel: 100 },
      },
      delta: {
        symbols: [fixtureSymbol("sym_new", "changed", "src/file0.ts")],
        dependencies: [],
        parserStats: { ...emptyStats, total: 1, babel: 1 },
      },
      diff: {
        baseSnapshotId: "snap_a",
        targetSnapshotId: "snap_b",
        added: [],
        removed: [],
        modified: [{ path: "src/file0.ts", beforeHash: "1", afterHash: "2", sizeDelta: 0 }],
        unchanged: 99,
        changeRatio: 0.01,
      },
      filesTotal: 100,
    });

    expect(merged.metrics.savingsPercent).toBeGreaterThanOrEqual(85);
    expect(merged.metrics.meetsSavingsTarget).toBe(true);
    expect(merged.result.symbols).toHaveLength(100);
  });

  it("produces identical symbols on unchanged files vs full re-parse baseline", () => {
    const baseSymbols = [
      fixtureSymbol("sym_a", "alpha", "src/unchanged/a.ts"),
      fixtureSymbol("sym_b", "beta", "src/unchanged/b.ts"),
      fixtureSymbol("sym_c", "gamma", "src/changed/c.ts"),
    ];

    const base = {
      symbols: baseSymbols,
      dependencies: [],
      parserStats: { ...emptyStats, total: 3, babel: 3 },
    };

    const noChangeDiff = {
      baseSnapshotId: "snap_a",
      targetSnapshotId: "snap_b",
      added: [],
      removed: [],
      modified: [],
      unchanged: 3,
      changeRatio: 0,
    };

    const incrementalNoOp = mergeIncrementalParse({
      base,
      delta: { symbols: [], dependencies: [], parserStats: emptyStats },
      diff: noChangeDiff,
      filesTotal: 3,
    });

    const check = verifyUnchangedFileEquivalence(base, incrementalNoOp.result, noChangeDiff);
    expect(check.equal).toBe(true);
    expect(incrementalNoOp.result.symbols).toHaveLength(3);
    expect(incrementalNoOp.metrics.savingsPercent).toBe(100);
    for (const symbol of incrementalNoOp.result.symbols) {
      const original = baseSymbols.find((s) => s.id === symbol.id);
      expect(symbolsEquivalent(symbol, original!)).toBe(true);
    }
  });

  it("retains unchanged file symbols byte-for-byte when one file changes", () => {
    const baseSymbols = [
      fixtureSymbol("sym_a", "alpha", "src/stable/a.ts"),
      fixtureSymbol("sym_b", "beta", "src/stable/b.ts"),
      fixtureSymbol("sym_old", "oldFn", "src/hot/c.ts"),
    ];

    const base = {
      symbols: baseSymbols,
      dependencies: [],
      parserStats: { ...emptyStats, total: 3, babel: 3 },
    };

    const diff = {
      baseSnapshotId: "snap_a",
      targetSnapshotId: "snap_b",
      added: [],
      removed: [],
      modified: [{ path: "src/hot/c.ts", beforeHash: "1", afterHash: "2", sizeDelta: 10 }],
      unchanged: 2,
      changeRatio: 1 / 3,
    };

    const incremental = mergeIncrementalParse({
      base,
      delta: {
        symbols: [fixtureSymbol("sym_new", "newFn", "src/hot/c.ts")],
        dependencies: [],
        parserStats: { ...emptyStats, total: 1, babel: 1 },
      },
      diff,
      filesTotal: 3,
    });

    const check = verifyUnchangedFileEquivalence(base, incremental.result, diff);
    expect(check.equal).toBe(true);
    expect(incremental.metrics.savingsPercent).toBeGreaterThanOrEqual(66);
    expect(incremental.result.symbols.find((s) => s.filePath === "src/stable/a.ts")?.name).toBe(
      "alpha",
    );
  });
});