import { describe, expect, it } from "vitest";
import { buildCouncilEvidenceBundle, serializeCouncilEvidenceForLlm } from "./council-evidence.js";

describe("buildCouncilEvidenceBundle", () => {
  it("includes evidence chains and deduped pool", () => {
    const bundle = buildCouncilEvidenceBundle(
      { overall: 70, maturityStage: "developing", domains: [] },
      [
        {
          id: "f1",
          domain: "security posture",
          severity: "High-risk flaw",
          confidence: "Confirmed",
          title: "Auth gap",
          description: "desc",
          evidence: [
            { snapshotHash: "h", filePath: "src/a.ts", lineStart: 10, extractionMethod: "AST" },
          ],
          evidenceChain: [
            { snapshotHash: "h", filePath: "src/a.ts", lineStart: 10, extractionMethod: "AST" },
          ],
        },
      ],
      {
        services: [
          {
            id: "s1",
            name: "api",
            confidence: "Confirmed",
            evidence: [{ snapshotHash: "h", filePath: "src/a.ts", extractionMethod: "AST" }],
          },
        ],
        modules: [],
        edges: [],
      },
    );

    expect(bundle.findings[0]?.evidenceChain[0]?.lineStart).toBe(10);
    expect(bundle.evidencePool.length).toBeGreaterThan(0);

    const serialized = serializeCouncilEvidenceForLlm(bundle);
    expect(serialized).toContain("src/a.ts");
    expect(serialized).toContain("evidencePoolSample");
  });
});