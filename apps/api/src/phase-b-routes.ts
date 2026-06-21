import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createId, type ActivationSurveyResponse, type OnboardingStep } from "@codetruth/core";
import { computeBetaMetrics, PHASE_B_GATES } from "@codetruth/telemetry";
import { authenticate } from "./auth.js";
import { BetaAccessError, ensureDefaultBetaInvite, redeemBetaInvite } from "./beta-service.js";
import { store } from "./context.js";
import {
  completeOnboardingStep,
  getOrCreateOnboarding,
  isBetaModeEnabled,
  recordFirstAnalysisCompleted,
  requireBetaAccess,
  submitActivationSurvey,
  trackEvent,
} from "./telemetry-service.js";

function isBetaAdmin(request: FastifyRequest): boolean {
  const token = process.env.BETA_ADMIN_TOKEN?.trim();
  if (!token) return false;
  const header = request.headers.authorization;
  return header === `Bearer ${token}` || header === token;
}

function sendBetaGate(reply: FastifyReply) {
  return reply.code(403).send({
    error: "Closed beta access required",
    code: "beta_access_required",
    betaMode: true,
  });
}

export async function registerPhaseBRoutes(app: FastifyInstance): Promise<void> {
  await ensureDefaultBetaInvite();

  app.get("/beta/status", { preHandler: authenticate }, async (request) => {
    const hasAccess = await requireBetaAccess(request.user!.id);
    const redemptions = await store.listBetaRedemptions(request.user!.id);
    return {
      betaMode: isBetaModeEnabled(),
      hasAccess,
      redemption: redemptions[0] ?? null,
    };
  });

  app.post<{ Body: { code?: string; workspaceId?: string } }>(
    "/beta/redeem",
    { preHandler: authenticate },
    async (request, reply) => {
      const code = request.body?.code?.trim();
      if (!code) return reply.code(400).send({ error: "code is required" });

      try {
        return await redeemBetaInvite({
          userId: request.user!.id,
          code,
          workspaceId: request.body?.workspaceId,
        });
      } catch (error) {
        if (error instanceof BetaAccessError) {
          return reply.code(400).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.post<{
    Body: {
      event?: string;
      workspaceId?: string;
      projectId?: string;
      analysisId?: string;
      properties?: Record<string, unknown>;
    };
  }>("/telemetry/track", { preHandler: authenticate }, async (request, reply) => {
    const event = request.body?.event?.trim();
    if (!event) return reply.code(400).send({ error: "event is required" });

    await trackEvent(event, {
      userId: request.user!.id,
      workspaceId: request.body?.workspaceId,
      projectId: request.body?.projectId,
      analysisId: request.body?.analysisId,
      properties: request.body?.properties,
    });
    return { ok: true };
  });

  app.get("/onboarding", { preHandler: authenticate }, async (request) => {
    const onboarding = await getOrCreateOnboarding(request.user!.id);
    return { onboarding };
  });

  app.post<{ Body: { step?: OnboardingStep } }>(
    "/onboarding/step",
    { preHandler: authenticate },
    async (request, reply) => {
      const step = request.body?.step;
      if (!step) return reply.code(400).send({ error: "step is required" });
      const onboarding = await completeOnboardingStep(request.user!.id, step);
      return { onboarding };
    },
  );

  app.post<{ Body: { analysisId?: string } }>(
    "/telemetry/first-analysis",
    { preHandler: authenticate },
    async (request, reply) => {
      const analysisId = request.body?.analysisId?.trim();
      if (!analysisId) return reply.code(400).send({ error: "analysisId is required" });

      const analysis = await store.getAnalysis(analysisId);
      if (!analysis) return reply.code(404).send({ error: "Analysis not found" });

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const onboarding = await recordFirstAnalysisCompleted(request.user!.id, analysisId, {
        projectId: project.id,
        workspaceId: project.workspaceId,
        findingCount: analysis.artifacts?.findings?.length,
      });
      return { onboarding };
    },
  );

  app.post<{ Body: ActivationSurveyResponse }>(
    "/onboarding/activation-survey",
    { preHandler: authenticate },
    async (request, reply) => {
      const body = request.body;
      if (
        typeof body.unknownFindingsCount !== "number" ||
        typeof body.feltActivationMoment !== "boolean"
      ) {
        return reply.code(400).send({ error: "invalid activation survey payload" });
      }

      const onboarding = await submitActivationSurvey(request.user!.id, {
        unknownFindingsCount: body.unknownFindingsCount,
        feltActivationMoment: body.feltActivationMoment,
        notes: body.notes,
      });
      return { onboarding };
    },
  );

  app.get("/admin/beta/metrics", async (request, reply) => {
    if (!isBetaAdmin(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const users = await store.listUsers();
    const [onboardings, events, analyses, betaRedemptions] = await Promise.all([
      Promise.all(users.map((user) => store.getUserOnboarding(user.id))).then((rows) =>
        rows.filter((row): row is NonNullable<typeof row> => Boolean(row)),
      ),
      store.listProductEvents(5000),
      store.listAnalyses(),
      store.countBetaRedemptions(),
    ] as const);

    const metrics = computeBetaMetrics({
      userCount: users.length,
      onboardings,
      events,
      analyses,
      betaRedemptions,
    });

    return {
      metrics,
      targets: {
        activationRate: PHASE_B_GATES.activationRate,
        habitFormationRate: PHASE_B_GATES.habitFormationRate,
        activationMomentRate: 0.7,
        medianMinutesToFirstInsight: 12,
      },
      generatedAt: new Date().toISOString(),
    };
  });

  app.post<{
    Body: {
      code?: string;
      label?: string;
      maxRedemptions?: number;
      grantsPlan?: "pro" | "team";
      trialDays?: number;
      expiresAt?: string;
    };
  }>("/admin/beta/invites", async (request, reply) => {
    if (!isBetaAdmin(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const code = request.body?.code?.trim().toUpperCase();
    if (!code) return reply.code(400).send({ error: "code is required" });

    const invite = {
      id: createId("binv"),
      code,
      label: request.body?.label,
      maxRedemptions: request.body?.maxRedemptions ?? 25,
      redemptionCount: 0,
      grantsPlan: request.body?.grantsPlan ?? "pro",
      trialDays: request.body?.trialDays ?? 45,
      expiresAt: request.body?.expiresAt,
      createdAt: new Date().toISOString(),
    };
    await store.saveBetaInvite(invite);
    return { invite };
  });

}

export { sendBetaGate };