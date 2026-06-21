import {
  buildModelContext,
  createId,
  serializeCouncilEvidenceForLlm,
  serializeModelContextForLlm,
} from "@codetruth/core";
import type {
  ConsensusTruthReport,
  ContradictionRecord,
  CouncilEvidenceBundle,
  CouncilModelContext,
  CouncilPhaseResult,
  ModelAssessment,
} from "@codetruth/core";
import {
  completeChatWithMeta,
  getCouncilModel,
  getSessionLlmCostUsd,
  isLlmEnabled,
  resetSessionLlmCost,
  type LlmMessage,
} from "./client.js";

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
    "You are the Architecture Model. Assess code structure, modularity, service boundaries, and integration health. Every bullet must cite an evidence filePath from the shared pool.",
  "Runtime Model":
    "You are the Runtime Model. Assess build readiness, deployability, health checks, and runtime failure modes. Cite evidence paths and snippets.",
  "DevOps Model":
    "You are the DevOps Model. Assess CI/CD, observability, release workflow, and operational maturity. Cite config paths from evidence.",
  "Security Model":
    "You are the Security Model. Assess authentication, secrets handling, exposure risks, and security posture. Cite file evidence for each claim.",
  "Planning Model":
    "You are the Planning Model. Prioritize remediation, sequencing, and effort realism. Reference finding ids and evidence when challenging scope.",
};

export interface LlmCouncilResult {
  consensus: ConsensusTruthReport;
  modelNotes: Record<CouncilModel, string[]>;
  phases: CouncilPhaseResult[];
  contradictionRegister: ContradictionRecord[];
  llmPowered: true;
  provider?: string;
  model?: string;
  estimatedCostUsd?: number;
}

function parseBulletList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 12);
}

async function phase1(
  model: CouncilModel,
  bundleContext: string,
  modelContext: string,
  injectedContext: CouncilModelContext,
  onProvider?: (provider: string, modelName: string) => void,
): Promise<ModelAssessment> {
  const messages: LlmMessage[] = [
    { role: "system", content: MODEL_PROMPTS[model] },
    {
      role: "user",
      content: `Phase 1 — independent assessment. Return 4-8 bullet findings citing evidence file paths.

Per-model context (snippets, architecture nodes, scoped findings):
${modelContext}

Shared council evidence:
${bundleContext}`,
    },
  ];
  const result = await completeChatWithMeta(messages, { model: getCouncilModel(model) });
  onProvider?.(result.provider, result.model);
  const bullets = parseBulletList(result.content);
  return {
    model,
    bullets,
    confidence: bullets.length >= 4 ? "Strongly Inferred" : "Weakly Inferred",
    findingsReviewed: bullets.length,
    evidenceCited: [],
    injectedContext,
  };
}

async function phase2Challenge(
  model: CouncilModel,
  context: string,
  peerNotes: Record<CouncilModel, ModelAssessment>,
): Promise<{ assessment: ModelAssessment; contradictions: ContradictionRecord[] }> {
  const messages: LlmMessage[] = [
    { role: "system", content: MODEL_PROMPTS[model] },
    {
      role: "user",
      content: `Phase 2 — cross-review with evidence-weighted rebuttals.
Return two sections:
CHALLENGES:
- contradiction statement citing specific filePath/snippet from evidence pool
REVISED:
- updated assessment bullets

Peer assessments:
${JSON.stringify(
  Object.fromEntries(
    COUNCIL_MODELS.map((m) => [m, peerNotes[m].bullets]),
  ),
  null,
  2,
)}

Structured evidence:
${context}`,
    },
  ];
  const { content } = await completeChatWithMeta(messages, {
    model: getCouncilModel(model),
    maxTokens: 1500,
  });
  const challengeBlock = content.split(/REVISED:/i)[0] ?? content;
  const revisedBlock = content.split(/REVISED:/i)[1] ?? "";
  const challenges = parseBulletList(challengeBlock.replace(/CHALLENGES:/i, ""));
  const notes = parseBulletList(revisedBlock);

  const contradictions: ContradictionRecord[] = challenges.slice(0, 4).map((challenge) => {
    const positionB = {
      model,
      stance: "challenges" as const,
      claim: challenge,
      confidence: "Weakly Inferred" as const,
      evidenceRefs: [] as string[],
    };
    const positionA = {
      model: "Truth Council",
      stance: "supports" as const,
      claim: `${model} independent assessment`,
      confidence: "Strongly Inferred" as const,
      evidenceRefs: [] as string[],
    };
    return {
      id: createId("contradiction"),
      claim: `${model} independent assessment`,
      challenge,
      models: [model, "Truth Council"],
      modelA: "Truth Council",
      modelB: model,
      positionA,
      positionB,
      severity: "unresolved" as const,
      impactSeverity: "medium" as const,
      disagreementPenalty: 0.3,
      resolution: "preserved_disagreement" as const,
      suggestedResolution:
        "Preserve LLM disagreement; corroborate with repository evidence before upgrading confidence.",
      positions: [positionA, positionB],
    };
  });

  const bullets = notes.length ? notes : parseBulletList(content);
  return {
    assessment: {
      model,
      bullets,
      confidence: contradictions.length ? "Strongly Inferred" : "Confirmed",
      findingsReviewed: bullets.length,
      evidenceCited: [],
    },
    contradictions,
  };
}

async function phase3Consensus(
  context: string,
  phases: CouncilPhaseResult[],
): Promise<ConsensusTruthReport> {
  const messages: LlmMessage[] = [
    {
      role: "system",
      content:
        "You are the Consensus Builder. Synthesize agreed claims, inferred claims, contradictions, and unknowns. Preserve disagreements — do not average conflicting positions. Return strict JSON.",
    },
    {
      role: "user",
      content: `Return strict JSON:
{"summary":"","confirmedClaims":[],"inferredClaims":[],"contradictions":[],"unknowns":[],"synthesisConfidence":"Strongly Inferred"}

Council phases:
${JSON.stringify(phases, null, 2)}

Structured evidence:
${context}`,
    },
  ];
  const { content } = await completeChatWithMeta(messages, {
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
    synthesisConfidence: "Unknown",
  };
}

export async function runLlmTruthCouncil(
  bundle: CouncilEvidenceBundle,
): Promise<LlmCouncilResult> {
  if (!isLlmEnabled()) {
    throw new Error("LLM is not configured");
  }

  resetSessionLlmCost();
  let primaryProvider: string | undefined;
  let primaryModel: string | undefined;

  const context = serializeCouncilEvidenceForLlm(bundle);

  const phase1Results = Object.fromEntries(
    await Promise.all(
      COUNCIL_MODELS.map(async (model) => {
        const injectedContext = buildModelContext(bundle, model);
        const assessment = await phase1(
          model,
          context,
          serializeModelContextForLlm(injectedContext),
          injectedContext,
          (provider, modelName) => {
            if (!primaryProvider) {
              primaryProvider = provider;
              primaryModel = modelName;
            }
          },
        );
        return [model, assessment] as const;
      }),
    ),
  ) as Record<CouncilModel, ModelAssessment>;

  const phase2Results = Object.fromEntries(
    await Promise.all(
      COUNCIL_MODELS.map(async (model) => {
        const result = await phase2Challenge(model, context, phase1Results);
        return [model, result] as const;
      }),
    ),
  ) as Record<CouncilModel, { assessment: ModelAssessment; contradictions: ContradictionRecord[] }>;

  const contradictionRegister = Object.values(phase2Results).flatMap((r) => r.contradictions);
  const modelNotes = Object.fromEntries(
    COUNCIL_MODELS.map((model) => [model, phase2Results[model].assessment.bullets]),
  ) as Record<CouncilModel, string[]>;

  const phases: CouncilPhaseResult[] = [
    {
      phase: "independent",
      modelAssessments: Object.fromEntries(
        COUNCIL_MODELS.map((m) => [m, phase1Results[m].bullets]),
      ),
      structuredAssessments: Object.values(phase1Results),
      contradictions: [],
      summary: "LLM independent first-pass completed for all five models.",
    },
    {
      phase: "cross_review",
      modelAssessments: modelNotes,
      structuredAssessments: Object.values(phase2Results).map((r) => r.assessment),
      contradictions: contradictionRegister,
      summary: `${contradictionRegister.length} cross-review challenge(s) recorded with evidence citations.`,
    },
    {
      phase: "consensus",
      modelAssessments: modelNotes,
      structuredAssessments: Object.values(phase2Results).map((r) => r.assessment),
      contradictions: contradictionRegister.filter((c) => c.severity === "unresolved"),
      summary: "Consensus synthesis preserves unresolved disagreements.",
    },
  ];

  const consensus = await phase3Consensus(context, phases);

  return {
    consensus,
    modelNotes,
    phases,
    contradictionRegister,
    llmPowered: true,
    provider: primaryProvider,
    model: primaryModel,
    estimatedCostUsd: getSessionLlmCostUsd(),
  };
}