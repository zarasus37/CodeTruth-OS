import type { AnalysisJob, ProductEvent, UserOnboarding } from "@codetruth/core";

const MS_PER_DAY = 86_400_000;

export interface BetaMetrics {
  totalUsers: number;
  usersWithFirstAnalysis: number;
  activationSurveyRate: number;
  activationMomentRate: number;
  medianMinutesToFirstInsight: number | null;
  habitFormationRate: number;
  analysesCompleted: number;
  analysesFailed: number;
  betaRedemptions: number;
  onboardingCompletionRate: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function computeBetaMetrics(input: {
  userCount: number;
  onboardings: UserOnboarding[];
  events: ProductEvent[];
  analyses: AnalysisJob[];
  betaRedemptions: number;
}): BetaMetrics {
  const completedFirst = input.onboardings.filter((o) => o.firstAnalysisCompletedAt);
  const surveyed = input.onboardings.filter((o) => o.activationSurvey);
  const feltActivation = surveyed.filter((o) => o.activationSurvey?.feltActivationMoment);

  const signupByUser = new Map<string, number>();
  for (const event of input.events) {
    if (event.event === "user.signed_up" && event.userId) {
      signupByUser.set(event.userId, new Date(event.timestamp).getTime());
    }
  }

  const minutesToInsight: number[] = [];
  for (const onboarding of completedFirst) {
    const signupAt = signupByUser.get(onboarding.userId);
    if (!signupAt || !onboarding.firstAnalysisCompletedAt) continue;
    const completedAt = new Date(onboarding.firstAnalysisCompletedAt).getTime();
    minutesToInsight.push((completedAt - signupAt) / 60_000);
  }

  const completedAnalyses = input.analyses.filter((a) => a.status === "completed");
  const failedAnalyses = input.analyses.filter((a) => a.status === "failed");

  const projectsWithHabit = new Set<string>();
  const byProject = new Map<string, AnalysisJob[]>();
  for (const analysis of completedAnalyses) {
    const list = byProject.get(analysis.projectId) ?? [];
    list.push(analysis);
    byProject.set(analysis.projectId, list);
  }

  for (const [, analyses] of byProject) {
    const sorted = analyses
      .filter((a) => a.completedAt)
      .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!));
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]!.completedAt!).getTime();
      const next = new Date(sorted[i]!.completedAt!).getTime();
      if (next - prev <= 7 * MS_PER_DAY) {
        projectsWithHabit.add(sorted[i]!.projectId);
        break;
      }
    }
  }

  const onboardingCompleted = input.onboardings.filter((o) => o.completedAt).length;

  return {
    totalUsers: input.userCount,
    usersWithFirstAnalysis: completedFirst.length,
    activationSurveyRate:
      completedFirst.length > 0 ? surveyed.length / completedFirst.length : 0,
    activationMomentRate: surveyed.length > 0 ? feltActivation.length / surveyed.length : 0,
    medianMinutesToFirstInsight: median(minutesToInsight),
    habitFormationRate:
      byProject.size > 0 ? projectsWithHabit.size / byProject.size : 0,
    analysesCompleted: completedAnalyses.length,
    analysesFailed: failedAnalyses.length,
    betaRedemptions: input.betaRedemptions,
    onboardingCompletionRate:
      input.userCount > 0 ? onboardingCompleted / input.userCount : 0,
  };
}