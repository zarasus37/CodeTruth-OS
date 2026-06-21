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
    const result = parseWithBabel("src/app.ts", source);
    expect(result.symbols.some((s) => s.name === "Service" && s.kind === "class")).toBe(true);
    expect(result.symbols.some((s) => s.name === "helper" && s.kind === "function")).toBe(true);
    expect(result.dependencies.some((d) => d.to === "./foo")).toBe(true);
  });
});