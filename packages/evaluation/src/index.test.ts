import { describe, expect, it } from "vitest";
import type { ArchitectureGraph, SnapshotRecord } from "@codetruth/core";
import { evaluateProject } from "./index.js";

const snapshot: SnapshotRecord = {
  id: "snap_1",
  projectId: "proj_1",
  hash: "hash_eval",
  createdAt: new Date().toISOString(),
  fileCount: 3,
  manifest: [
    { path: "package.json", hash: "h1", size: 100 },
    { path: "src/app.ts", hash: "h2", size: 200 },
    { path: "README.md", hash: "h3", size: 50 },
  ],
  stackProfile: {
    languages: ["typescript"],
    frameworks: [],
    packageManagers: [],
    containerization: [],
    infrastructureAsCode: [],
    cicd: [],
    testFrameworks: [],
  },
  rootPath: "/tmp/project",
};

const architecture: ArchitectureGraph = {
  modules: [{ id: "mod_1", name: "app", confidence: "Strongly Inferred" }],
  services: [],
  edges: [],
};

describe("evaluateProject confidence gating", () => {
  it("flags high-severity repo-scan findings without anchored evidence", () => {
    const { findings } = evaluateProject(snapshot, architecture);
    const missingCi = findings.find((f) => f.title === "Missing CI/CD pipeline");
    const missingTests = findings.find((f) => f.title === "No automated test suite detected");

    expect(missingCi).toBeDefined();
    expect(missingCi?.flaggedForWeakEvidence).toBe(true);
    expect(missingCi?.confidence).toBe("Unknown");

    expect(missingTests).toBeDefined();
    expect(missingTests?.flaggedForWeakEvidence).toBe(true);
    expect(missingTests?.confidence).not.toBe("Confirmed");
  });

  it("allows confirmed confidence for artifact-backed medium findings", () => {
    const { findings } = evaluateProject(snapshot, architecture);
    const missingEnv = findings.find(
      (f) => f.title === "Missing environment configuration template",
    );

    expect(missingEnv).toBeDefined();
    expect(missingEnv?.evidenceChain[0]?.extractionMethod).toBe("config_parse");
    expect(missingEnv?.confidence).toBe("Confirmed");
    expect(missingEnv?.flaggedForWeakEvidence).toBeUndefined();
  });
});