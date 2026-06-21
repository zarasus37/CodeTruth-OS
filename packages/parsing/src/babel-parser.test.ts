import { describe, expect, it } from "vitest";
import { parseWithBabel } from "./babel-parser.js";

describe("parseWithBabel", () => {
  it("extracts functions, classes, and imports from TypeScript", () => {
    const source = `
      import { foo } from './foo';
      export class Service {
        run() {}
      }
      export function helper() {}
    `;
    const result = parseWithBabel("src/app.ts", source, {
      snapshotHash: "snap_1",
      engine: "babel",
      parserEngine: "babel",
    });
    expect(result.symbols.some((s) => s.name === "Service" && s.kind === "class")).toBe(true);
    expect(result.symbols.some((s) => s.name === "helper" && s.kind === "function")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "./foo")).toBe(true);
    expect(result.symbols.every((s) => s.evidenceChain.length >= 1)).toBe(true);
    expect(result.symbols.every((s) => s.confidence === "Confirmed")).toBe(true);
  });
});