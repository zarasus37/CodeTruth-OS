import { describe, expect, it } from "vitest";
import {
  createAbsenceEvidence,
  createEvidenceFromSymbol,
  createLlmAnalysisEvidence,
  enrichEvidenceRecord,
  hasRichSnippet,
  isSubstantiveEvidence,
} from "./evidence.js";

describe("evidence factories", () => {
  it("enriches records with id, createdAt, and rawSnippet", () => {
    const record = enrichEvidenceRecord({
      filePath: "src/a.ts",
      lineStart: 10,
      extractionMethod: "AST",
      rawSnippet: "export function login() {}",
      confidenceAtExtraction: "Confirmed",
      snapshotHash: "hash1",
    });

    expect(record.id).toMatch(/^ev_/);
    expect(record.createdAt).toBeTruthy();
    expect(hasRichSnippet(record)).toBe(true);
    expect(isSubstantiveEvidence(record)).toBe(true);
  });

  it("creates absence evidence with Unknown confidence", () => {
    const record = createAbsenceEvidence(
      {
        id: "snap",
        projectId: "p",
        hash: "h",
        createdAt: new Date().toISOString(),
        fileCount: 1,
        manifest: [],
        stackProfile: {
          languages: [],
          frameworks: [],
          packageManagers: [],
          containerization: [],
          infrastructureAsCode: [],
          cicd: [],
          testFrameworks: [],
        },
        rootPath: "/tmp",
      },
      { id: "f1", title: "Missing tests", description: "No test files" },
    );

    expect(record.extractionMethod).toBe("absence");
    expect(record.confidenceAtExtraction).toBe("Unknown");
    expect(record.rawSnippet).toContain("Missing tests");
  });

  it("creates llm_analysis evidence with council metadata", () => {
    const record = createLlmAnalysisEvidence({
      snapshotHash: "hash1",
      model: "Security Model",
      claim: "src/api.ts exposes admin routes without auth middleware",
      filePath: "src/api.ts",
      lineStart: 42,
      phase: "cross_review",
    });

    expect(record.extractionMethod).toBe("llm_analysis");
    expect(record.confidenceAtExtraction).toBe("Strongly Inferred");
    expect(record.metadata?.councilModel).toBe("Security Model");
    expect(record.rawSnippet).toContain("admin routes");
  });

  it("creates rich evidence from symbols", () => {
    const record = createEvidenceFromSymbol(
      {
        id: "sym1",
        name: "login",
        kind: "function",
        filePath: "src/auth.ts",
        line: 4,
        confidence: "Confirmed",
        evidence: [
          {
            snapshotHash: "h",
            filePath: "src/auth.ts",
            lineStart: 4,
            extractionMethod: "AST",
            rawSnippet: "function login() {",
          },
        ],
        evidenceChain: [
          {
            snapshotHash: "h",
            filePath: "src/auth.ts",
            lineStart: 4,
            extractionMethod: "AST",
            rawSnippet: "function login() {",
          },
        ],
      },
      "h",
    );

    expect(record.symbolName).toBe("login");
    expect(record.rawSnippet).toContain("login");
    expect(record.extractionMethod).toBe("AST");
  });
});