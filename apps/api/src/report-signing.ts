import { createHmac } from "node:crypto";
import type { ReportApproval, TruthReport } from "@codetruth/core";

export function signReport(report: TruthReport, approval: ReportApproval): string {
  const secret = process.env.REPORT_SIGNING_SECRET ?? "codetruth-dev-signing-key";
  const payload = JSON.stringify({
    analysisId: report.analysisId,
    snapshotId: report.snapshotId,
    generatedAt: report.generatedAt,
    overall: report.scorecard.overall,
    maturityStage: report.scorecard.maturityStage,
    analyzerVersion: approval.analyzerVersion,
    approvedAt: approval.reviewedAt,
  });
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyReportSignature(report: TruthReport, approval: ReportApproval): boolean {
  if (!approval.signature) return false;
  return signReport(report, approval) === approval.signature;
}