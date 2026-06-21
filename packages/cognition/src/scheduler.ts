import type { ReAnalysisInterval, ReAnalysisSchedule } from "@codetruth/core";

const INTERVAL_MS: Record<ReAnalysisInterval, number> = {
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function intervalToMs(interval: ReAnalysisInterval): number {
  return INTERVAL_MS[interval];
}

export function computeNextRunAt(
  interval: ReAnalysisInterval,
  from = new Date(),
): string {
  return new Date(from.getTime() + intervalToMs(interval)).toISOString();
}

export function scheduleIsDue(schedule: ReAnalysisSchedule, now = Date.now()): boolean {
  if (!schedule.enabled || !schedule.nextRunAt) return false;
  return Date.parse(schedule.nextRunAt) <= now;
}

export function advanceSchedule(
  schedule: ReAnalysisSchedule,
  ranAt = new Date(),
): ReAnalysisSchedule {
  return {
    ...schedule,
    lastRunAt: ranAt.toISOString(),
    nextRunAt: computeNextRunAt(schedule.interval, ranAt),
  };
}