import { buildTruthReport } from "@codetruth/reports";
import { store } from "./context.js";

export async function buildFullReport(analysisId: string) {
  const analysis = await store.getAnalysis(analysisId);
  if (!analysis?.artifacts) return null;
  const [reviews, annotations, approval] = await Promise.all([
    store.listFindingReviews(analysisId),
    store.listFindingAnnotations(analysisId),
    store.getReportApproval(analysisId),
  ]);
  return buildTruthReport(analysisId, analysis.projectId, analysis.artifacts, {
    reviews,
    annotations,
    approval,
  });
}