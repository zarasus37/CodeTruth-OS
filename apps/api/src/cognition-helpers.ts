import type { AnalysisJob, Project } from "@codetruth/core";
import { buildInstitutionalPortfolioView } from "@codetruth/cognition";
import { store } from "./context.js";

export async function loadAnalysesByProject(
  projects: Project[],
): Promise<Map<string, AnalysisJob[]>> {
  const map = new Map<string, AnalysisJob[]>();
  for (const project of projects) {
    map.set(project.id, await store.listAnalyses(project.id));
  }
  return map;
}

export async function buildWorkspaceInstitutionalView(workspaceId: string) {
  const projects = await store.listProjects(workspaceId);
  const analysesByProject = await loadAnalysesByProject(projects);
  const attestations = await store.listComplianceAttestations(workspaceId);
  const customPolicies = await store.listCustomCompliancePolicies(workspaceId);
  const activity = await store.listCognitionActivity(workspaceId, 50);
  const schedules = await store.listReAnalysisSchedules(workspaceId);

  return buildInstitutionalPortfolioView({
    workspaceId,
    projects,
    analysesByProject,
    attestations,
    customPolicies,
    activity,
    schedules,
  });
}