import {
  createId,
  type ActivationSurveyResponse,
  type OnboardingStep,
  type ProductEventName,
  type UserOnboarding,
} from "@codetruth/core";
import { store } from "./context.js";

export function isBetaModeEnabled(): boolean {
  return process.env.BETA_MODE === "true";
}

export async function trackEvent(
  event: ProductEventName | string,
  context: {
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    analysisId?: string;
    properties?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await store.appendProductEvent({
    id: createId("evt"),
    event,
    userId: context.userId,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    analysisId: context.analysisId,
    properties: context.properties,
    timestamp: new Date().toISOString(),
  });
}

export async function getOrCreateOnboarding(userId: string): Promise<UserOnboarding> {
  const existing = await store.getUserOnboarding(userId);
  if (existing) return existing;
  const onboarding: UserOnboarding = {
    userId,
    completedSteps: [],
    updatedAt: new Date().toISOString(),
  };
  await store.saveUserOnboarding(onboarding);
  return onboarding;
}

export async function completeOnboardingStep(userId: string, step: OnboardingStep) {
  const onboarding = await getOrCreateOnboarding(userId);
  if (!onboarding.completedSteps.includes(step)) {
    onboarding.completedSteps.push(step);
  }
  onboarding.updatedAt = new Date().toISOString();

  const allSteps: OnboardingStep[] = [
    "welcome",
    "create_workspace",
    "create_project",
    "first_upload",
    "view_report",
    "activation_survey",
  ];
  if (allSteps.every((item) => onboarding.completedSteps.includes(item))) {
    onboarding.completedAt = new Date().toISOString();
  }

  await store.saveUserOnboarding(onboarding);
  await trackEvent("onboarding.step_completed", { userId, properties: { step } });
  if (onboarding.completedAt) {
    await trackEvent("onboarding.completed", { userId });
  }
  return onboarding;
}

export async function recordFirstAnalysisCompleted(
  userId: string,
  analysisId: string,
  properties?: Record<string, unknown>,
) {
  const onboarding = await getOrCreateOnboarding(userId);
  if (!onboarding.firstAnalysisCompletedAt) {
    onboarding.firstAnalysisCompletedAt = new Date().toISOString();
    onboarding.updatedAt = onboarding.firstAnalysisCompletedAt;
    await store.saveUserOnboarding(onboarding);
  }
  await completeOnboardingStep(userId, "first_upload");
  await trackEvent("analysis.completed", {
    userId,
    analysisId,
    properties: { firstAnalysis: !onboarding.activationSurvey, ...properties },
  });
  return getOrCreateOnboarding(userId);
}

export async function submitActivationSurvey(
  userId: string,
  response: ActivationSurveyResponse,
) {
  const onboarding = await getOrCreateOnboarding(userId);
  onboarding.activationSurvey = response;
  onboarding.activationSurveyAt = new Date().toISOString();
  onboarding.updatedAt = onboarding.activationSurveyAt;
  await store.saveUserOnboarding(onboarding);
  await completeOnboardingStep(userId, "activation_survey");
  await trackEvent("activation.survey_submitted", {
    userId,
    properties: {
      unknownFindingsCount: response.unknownFindingsCount,
      feltActivationMoment: response.feltActivationMoment,
    },
  });
  return onboarding;
}

export async function requireBetaAccess(userId: string): Promise<boolean> {
  if (!isBetaModeEnabled()) return true;
  return store.hasUserBetaAccess(userId);
}