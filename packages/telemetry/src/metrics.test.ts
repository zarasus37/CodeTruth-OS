import { describe, expect, it } from "vitest";
import { computeBetaMetrics } from "./metrics.js";

describe("beta metrics", () => {
  it("computes activation and habit rates", () => {
    const metrics = computeBetaMetrics({
      userCount: 2,
      onboardings: [
        {
          userId: "u1",
          completedSteps: ["welcome", "first_upload", "view_report"],
          firstAnalysisCompletedAt: "2026-06-01T00:12:00.000Z",
          activationSurvey: { unknownFindingsCount: 4, feltActivationMoment: true },
          activationSurveyAt: "2026-06-01T00:13:00.000Z",
          updatedAt: "2026-06-01T00:13:00.000Z",
        },
        {
          userId: "u2",
          completedSteps: ["welcome"],
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      events: [
        {
          id: "e1",
          event: "user.signed_up",
          userId: "u1",
          timestamp: "2026-06-01T00:00:00.000Z",
        },
      ],
      analyses: [
        {
          id: "a1",
          projectId: "p1",
          snapshotId: "s1",
          status: "completed",
          progress: 100,
          createdAt: "2026-06-01T00:05:00.000Z",
          completedAt: "2026-06-01T00:12:00.000Z",
        },
        {
          id: "a2",
          projectId: "p1",
          snapshotId: "s2",
          status: "completed",
          progress: 100,
          createdAt: "2026-06-03T00:05:00.000Z",
          completedAt: "2026-06-03T00:12:00.000Z",
        },
      ],
      betaRedemptions: 1,
    });

    expect(metrics.usersWithFirstAnalysis).toBe(1);
    expect(metrics.activationRate).toBe(0.5);
    expect(metrics.activationMomentRate).toBe(1);
    expect(metrics.medianMinutesToFirstInsight).toBe(12);
    expect(metrics.habitFormationRate).toBe(1);
    expect(metrics.gates.activationMet).toBe(false);
    expect(metrics.gates.habitMet).toBe(true);
  });
});