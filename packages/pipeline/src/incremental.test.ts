import { describe, expect, it } from "vitest";
import { mergeIncrementalParse } from "./incremental.js";

describe("mergeIncrementalParse", () => {
  it("achieves 85%+ savings when only one file changes in a large snapshot", () => {
    const baseSymbols = Array.from({ length: 100 }, (_, i) => ({
      id: `sym_${i}`,
      name: `fn${i}`,
      kind: "function" as const,
      filePath: `src/file${i}.ts`,
    }));

    const merged = mergeIncrementalParse({
      base: {
        symbols: baseSymbols,
        dependencies: [],
        parserStats: {
          total: 100,
          skipped: 0,
          treesitter: 0,
          babel: 100,
          python: 0,
          go: 0,
          rust: 0,
          java: 0,
          csharp: 0,
          ruby: 0,
        },
      },
      delta: {
        symbols: [{ id: "sym_new", name: "changed", kind: "function", filePath: "src/file0.ts" }],
        dependencies: [],
        parserStats: {
          total: 1,
          skipped: 0,
          treesitter: 0,
          babel: 1,
          python: 0,
          go: 0,
          rust: 0,
          java: 0,
          csharp: 0,
          ruby: 0,
        },
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
});