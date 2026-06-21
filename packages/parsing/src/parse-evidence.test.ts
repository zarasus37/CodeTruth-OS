import { describe, expect, it } from "vitest";
import { buildEvidenceFromParseResult } from "./parse-evidence.js";
import { makeSymbol } from "./evidence.js";

const ctx = { snapshotHash: "snap_h", engine: "babel" as const, parserEngine: "babel" };

describe("buildEvidenceFromParseResult", () => {
  it("aggregates symbol and dependency evidence with file index", () => {
    const symbol = makeSymbol({
      ctx,
      name: "authenticate",
      kind: "function",
      filePath: "src/auth.ts",
      line: 10,
      lineEnd: 25,
    });

    const ledger = buildEvidenceFromParseResult({
      snapshotHash: "snap_h",
      symbols: [symbol],
      dependencies: [],
    });

    expect(ledger.symbolCount).toBe(1);
    expect(ledger.records.length).toBeGreaterThan(0);
    expect(ledger.records[0]?.symbolName).toBe("authenticate");
    expect(ledger.records[0]?.confidenceAtExtraction).toBe("Confirmed");
    expect(ledger.byFile["src/auth.ts"]?.length).toBeGreaterThan(0);
  });
});