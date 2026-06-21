import { createId } from "@codetruth/core";
import type { Finding, PhasedRoadmap, PlannerTask, PlanningTrack } from "@codetruth/core";

const SEVERITY_ORDER = [
  "Critical blocker",
  "High-risk flaw",
  "Medium-priority weakness",
  "Low-priority debt",
  "Informational observation",
] as const;

function effortForSeverity(finding: Finding): PlannerTask["effort"] {
  switch (finding.severity) {
    case "Critical blocker":
      return "L";
    case "High-risk flaw":
      return "M";
    case "Medium-priority weakness":
      return "S";
    case "Low-priority debt":
      return "XS";
    default:
      return "XS";
  }
}

function trackForFinding(finding: Finding): PlanningTrack {
  if (finding.severity === "Critical blocker" || finding.severity === "High-risk flaw") {
    return "stabilize";
  }
  if (finding.gapCategory === "CI/CD pipeline" || finding.gapCategory === "monitoring and alerting") {
    return "complete";
  }
  if (finding.domain === "security posture") {
    return "harden";
  }
  if (finding.domain === "documentation") {
    return "optimize";
  }
  return "scale";
}

function prerequisiteForFinding(finding: Finding, priorTasks: PlannerTask[]): string[] {
  const prereqs: string[] = [];

  if (finding.gapCategory === "CI/CD pipeline") {
    const testTask = priorTasks.find((t) => t.title.toLowerCase().includes("test"));
    if (testTask) prereqs.push(testTask.id);
  }

  if (finding.domain === "observability") {
    const healthTask = priorTasks.find((t) => t.title.toLowerCase().includes("health"));
    if (healthTask) prereqs.push(healthTask.id);
  }

  if (finding.domain === "security posture" && finding.severity !== "Informational observation") {
    const envTask = priorTasks.find((t) => t.title.toLowerCase().includes("environment"));
    if (envTask) prereqs.push(envTask.id);
  }

  return prereqs;
}

export function buildRoadmap(findings: Finding[]): PhasedRoadmap {
  const tracks: PhasedRoadmap["tracks"] = {
    stabilize: [],
    complete: [],
    harden: [],
    optimize: [],
    scale: [],
  };

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  const allTasks: PlannerTask[] = [];

  for (const finding of sorted) {
    const track = trackForFinding(finding);
    const prerequisites = prerequisiteForFinding(finding, allTasks);
    const task: PlannerTask = {
      id: createId("task"),
      title: `Resolve: ${finding.title}`,
      description: finding.description,
      effort: effortForSeverity(finding),
      track,
      prerequisites,
      acceptanceCriteria: [
        `Evidence shows ${finding.title.toLowerCase()} is addressed`,
        "Re-analysis no longer reports this finding at the same severity",
        ...(finding.remediationPath ? [finding.remediationPath] : []),
      ],
      findingIds: [finding.id],
    };
    tracks[track].push(task);
    allTasks.push(task);
  }

  return { tracks };
}