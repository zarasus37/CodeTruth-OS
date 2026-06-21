import { createId } from "@codetruth/core";
import type {
  ArchitectureGraph,
  BuildStateScorecard,
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilPhaseResult,
  Finding,
} from "@codetruth/core";
import { completeChat, getCouncilModel, isLlmEnabled, type LlmMessage } from "./client.js";

export const COUNCIL_MODELS = [
  "Architecture Model",
  "Runtime Model",
  "DevOps Model",
  "Security Model",
  "Planning Model",
] as const;

export type CouncilModel = (typeof COUNCIL_MODELS)[number];

const MODEL_PROMPTS: Record<CouncilModel, string> = {
  "Architecture Model":
    "You are the Architecture Model. Assess code structure, modularity, service boundaries, and integration health. Cite evidence paths when possible.",
  "Runtime Model":
    "You are the Runtime Model. Assess build readiness, deployability, health checks, and runtime failure modes.",
  "DevOps Model":
    "You are the DevOps Model. Assess CI/CD, observability, release workflow, and operational maturity.",
  "Security Model":
    "You are the Security Model. Assess authentication, secrets handling, exposure risks, and security posture.",
  "Planning Model":
    "You are the Planning Model. Prioritize remediation, sequencing, and effort realism across findings.",
};

export interface LlmCouncilResult {
  consensus: ConsensusTruthReport;
  modelNotes: Record<CouncilModel, string[]>;
  phases: CouncilPhaseResult[];
  contradictionRegister: ContradictionRecord[];
  llmPowered: true;
}

function evidenceContext(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
): string {
  return JSON.stringify(
    {
      overall: scorecard.overall,
      maturityStage: scorecard.maturityStage,
      domains: scorecard.domains,
      services: architecture.services.map((s) => s.name),
      moduleCount: architecture.modules.length,
      findings: findings.map((f) => ({
        title: f.title,
        severity: f.severity,
        domain: f.domain,
        confidence: f.confidence,
        description: f.description,
        evidence: f.evidence.slice(0, 2),
      })),
    },
    null,
    2,
  );
}

function parseBulletList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 12);
}

async function phase1(model: CouncilModel, context: string): Promise<string[]> {
  const messages: LlmMessage[] = [
    { role: "system", content: MODEL_PROMPTS[model] },
    {
      role: "user",
      content: `Phase 1 — independent assessment. Return 4-8 bullet findings.\n\nEvidence:\n${context}`,
    },
  ];
  const content = await completeChat(messages, { model: getCouncilModel(model) });
  return parseBulletList(content);
}

async function phase2Challenge(
  model: CouncilModel,
  context: string,
  peerNotes: Record<CouncilModel, string[]>,
): Promise<{ notes: string[]; contradictions: ContradictionRecord[] }> {
  const messages: LlmMessage[] = [
    { role: "system", content: MODEL_PROMPTS[model] },
    {
      role: "user",
      content: `Phase 2 — challenge peer assessments with evidence-weighted rebuttals.
Return two sections:
CHALLENGES:
- contradiction statement referencing evidence
REVISED:
- updated assessment bullets

Peer assessments:
${JSON.stringify(peerNotes, null, 2)}

Evidence:
${context}`,
    },
  ];
  const content = await completeChat(messages, { model: getCouncilModel(model), maxTokens: 1500 });
  const challengeBlock = content.split(/REVISED:/i)[0] ?? content;
  const revisedBlock = content.split(/REVISED:/i)[1] ?? "";
  const challenges = parseBulletList(challengeBlock.replace(/CHALLENGES:/i, ""));
  const notes = parseBulletList(revisedBlock);

  const contradictions: ContradictionRecord[] = challenges.slice(0, 4).map((challenge) => ({
    id: createId("contradiction"),
    claim: `${model} peer review`,
    challenge,
    models: [model, "Truth Council"],
    severity: "unresolved" as const,
  }));

  return { notes: notes.length ? notes : parseBulletList(content), contradictions };
}

async function phase3Consensus(context: string, phases: CouncilPhaseResult[]): Promise<ConsensusTruthReport> {
  const messages: LlmMessage[] = [
    {
      role: "system",
      content:
        "You are the Consensus Builder. Synthesize agreed claims, inferred claims, contradictions, and unknowns as JSON.",
    },
    {
      role: "user",
      content: `Return strict JSON:
{"summary":"","confirmedClaims":[],"inferredClaims":[],"contradictions":[],"unknowns":[]}

Council phases:
${JSON.stringify(phases, null, 2)}

Evidence:
${context}`,
    },
  ];
  const content = await completeChat(messages, {
    model: process.env.LLM_MODEL_CONSENSUS ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: 0.1,
    maxTokens: 1800,
  });
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      return JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as ConsensusTruthReport;
    } catch {
      // fall through
    }
  }
  return {
    summary: content.slice(0, 500),
    confirmedClaims: [],
    inferredClaims: [],
    contradictions: [],
    unknowns: [],
  };
}

export async function runLlmTruthCouncil(
  scorecard: BuildStateScorecard,
  findings: Finding[],
  architecture: ArchitectureGraph,
): Promise<LlmCouncilResult> {
  if (!isLlmEnabled()) {
    throw new Error("LLM is not configured");
  }

  const context = evidenceContext(scorecard, findings, architecture);

  const phase1Results = Object.fromEntries(
    await Promise.all(
      COUNCIL_MODELS.map(async (model) => [model, await phase1(model, context)] as const),
    ),
  ) as Record<CouncilModel, string[]>;

  const phase2Results = Object.fromEntries(
    await Promise.all(
      COUNCIL_MODELS.map(async (model) => {
        const result = await phase2Challenge(model, context, phase1Results);
        return [model, result] as const;
      }),
    ),
  ) as Record<CouncilModel, { notes: string[]; contradictions: ContradictionRecord[] }>;

  const contradictionRegister = Object.values(phase2Results).flatMap((r) => r.contradictions);
  const modelNotes = Object.fromEntries(
    COUNCIL_MODELS.map((model) => [model, phase2Results[model].notes]),
  ) as Record<CouncilModel, string[]>;

  const phases: CouncilPhaseResult[] = [
    { phase: "independent", modelAssessments: phase1Results, contradictions: [] },
    {
      phase: "cross_review",
      modelAssessments: modelNotes,
      contradictions: contradictionRegister,
    },
    {
      phase: "consensus",
      modelAssessments: modelNotes,
      contradictions: contradictionRegister.filter((c) => c.severity === "unresolved"),
    },
  ];

  const consensus = await phase3Consensus(context, phases);

  return {
    consensus,
    modelNotes,
    phases,
    contradictionRegister,
    llmPowered: true,
  };
}