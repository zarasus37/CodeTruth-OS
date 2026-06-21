import { describe, expect, it } from "vitest";
import type { CouncilPhaseResult, Finding } from "@codetruth/core";
import {
  applyLlmCouncilEvidenceToFindings,
  buildLlmEvidenceFromBullet,
  extractFilePathsFromClaim,
} from "./evidence.js";

describe("llm evidence helpers", () => {
  it("extracts file paths from council bullets", () => {
    const paths = extractFilePathsFromClaim(
      "Missing CI in .github/workflows/ci.yml; see package.json scripts",
    );
    expect(paths).toContain(".github/workflows/ci.yml");
    expect(paths).toContain("package.json");
  });

  it("builds llm_analysis evidence corroborated from the evidence pool", () => {
    const record = buildLlmEvidenceFromBullet({
      bullet: "src/auth.ts:12 lacks session validation for admin routes",
      model: "Security Model",
      snapshotHash: "hash1",
      pool: [
        {
          snapshotHash: "hash1",
          filePath: "src/auth.ts",
          lineStart: 12,
          extractionMethod: "AST",
          rawSnippet: "router.get('/admin')",
        },
      ],
      phase: "independent",
    });

    expect(record.extractionMethod).toBe("llm_analysis");
    expect(record.filePath).toBe("src/auth.ts");
    expect(record.lineStart).toBe(12);
    expect(record.metadata?.councilModel).toBe("Security Model");
  });

  it("attaches llm_analysis links to matching findings", () => {
    const findings: Finding[] = [
      {
        id: "find_ci",
        domain: "DevOps maturity",
        severity: "High-risk flaw",
        confidence: "Unknown",
        title: "Missing CI/CD pipeline",
        description: "No GitHub Actions workflow detected.",
        evidence: [
          {
            snapshotHash: "hash1",
            filePath: "repository",
            extractionMethod: "inference",
          },
        ],
        evidenceChain: [
          {
            snapshotHash: "hash1",
            filePath: "repository",
            extractionMethod: "inference",
          },
        ],
      },
    ];

    const phases: CouncilPhaseResult[] = [
      {
        phase: "independent",
        modelAssessments: {},
        structuredAssessments: [
          {
            model: "DevOps Model",
            bullets: ["Missing CI/CD pipeline — no .github/workflows/ci.yml present"],
            confidence: "Strongly Inferred",
            findingsReviewed: 1,
            evidenceCited: [],
          },
        ],
        contradictions: [],
      },
    ];

    const adjusted = applyLlmCouncilEvidenceToFindings(findings, phases, []);
    expect(adjusted[0]?.evidenceChain.some((e) => e.extractionMethod === "llm_analysis")).toBe(
      true,
    );
    expect(adjusted[0]?.evidenceChain).toHaveLength(2);
  });
});