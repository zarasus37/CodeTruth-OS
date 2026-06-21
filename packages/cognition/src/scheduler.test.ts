import { describe, expect, it } from "vitest";
import type { ReAnalysisSchedule } from "@codetruth/core";
import { advanceSchedule, computeNextRunAt, scheduleIsDue } from "./scheduler.js";

describe("re-analysis scheduler", () => {
  it("computes next run from interval", () => {
    const from = new Date("2026-06-21T12:00:00.000Z");
    const next = computeNextRunAt("24h", from);
    expect(next).toBe("2026-06-22T12:00:00.000Z");
  });

  it("detects due schedules", () => {
    const schedule: ReAnalysisSchedule = {
      id: "sched_1",
      workspaceId: "ws_1",
      projectId: "project_1",
      enabled: true,
      interval: "24h",
      nextRunAt: "2026-06-21T10:00:00.000Z",
      createdAt: "2026-06-20T10:00:00.000Z",
      createdBy: "user_1",
    };

    expect(scheduleIsDue(schedule, Date.parse("2026-06-21T11:00:00.000Z"))).toBe(true);
    expect(scheduleIsDue(schedule, Date.parse("2026-06-21T09:00:00.000Z"))).toBe(false);
  });

  it("advances schedule after run", () => {
    const schedule: ReAnalysisSchedule = {
      id: "sched_1",
      workspaceId: "ws_1",
      projectId: "project_1",
      enabled: true,
      interval: "6h",
      createdAt: "2026-06-20T10:00:00.000Z",
      createdBy: "user_1",
    };

    const ranAt = new Date("2026-06-21T12:00:00.000Z");
    const advanced = advanceSchedule(schedule, ranAt);
    expect(advanced.lastRunAt).toBe(ranAt.toISOString());
    expect(advanced.nextRunAt).toBe("2026-06-21T18:00:00.000Z");
  });
});