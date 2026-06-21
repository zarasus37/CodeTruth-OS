
import type { FastifyInstance } from "fastify";
import { createId } from "@codetruth/core";
import type { FindingReviewStatus, ReportApprovalStatus, TaskExportFormat } from "@codetruth/core";
import {
  ANALYZER_VERSION,
  renderFindingsCsv,
  renderHtmlReport,
  renderTaskExport,
} from "@codetruth/reports";
import { buildFullReport } from "./report-context.js";
import { authenticate } from "./auth.js";
import { store } from "./context.js";
import { signReport, verifyReportSignature } from "./report-signing.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";

async function resolveAnalysisContext(analysisId: string, request: Parameters<typeof requireWorkspaceAccess>[0], reply: Parameters<typeof requireWorkspaceAccess>[1]) {
  const analysis = await store.getAnalysis(analysisId);
  if (!analysis) {
    reply.code(404).send({ error: "Analysis not found" });
    return null;
  }
  const project = await store.getProject(analysis.projectId);
  if (!project) {
    reply.code(404).send({ error: "Project not found" });
    return null;
  }
  const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
  if (!member) return null;
  return { analysis, project, member };
}

export async function registerCollaborationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/analyses/:id/collaboration",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const [reviews, annotations, approval] = await Promise.all([
        store.listFindingReviews(request.params.id),
        store.listFindingAnnotations(request.params.id),
        store.getReportApproval(request.params.id),
      ]);
      return { reviews, annotations, approval };
    },
  );

  app.post<{
    Params: { id: string; findingId: string };
    Body: { body?: string };
  }>(
    "/analyses/:id/findings/:findingId/annotations",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const annotator = await requireWorkspaceAccess(
        request,
        reply,
        ctx.project.workspaceId,
        "finding:annotate",
      );
      if (!annotator) return;

      const body = request.body?.body?.trim();
      if (!body) return reply.code(400).send({ error: "body is required" });

      const annotation = {
        id: createId("annotation"),
        analysisId: request.params.id,
        findingId: request.params.findingId,
        workspaceId: ctx.project.workspaceId,
        userId: request.user!.id,
        body,
        createdAt: new Date().toISOString(),
      };
      await store.saveFindingAnnotation(annotation);
      await recordAudit({
        workspaceId: ctx.project.workspaceId,
        userId: request.user!.id,
        action: "finding.annotated",
        resourceType: "finding",
        resourceId: request.params.findingId,
        metadata: { analysisId: request.params.id },
      });
      return reply.code(201).send({ annotation });
    },
  );

  app.post<{
    Params: { id: string; findingId: string };
    Body: { status?: FindingReviewStatus; rationale?: string; deferUntil?: string };
  }>(
    "/analyses/:id/findings/:findingId/review",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const reviewer = await requireWorkspaceAccess(
        request,
        reply,
        ctx.project.workspaceId,
        "finding:annotate",
      );
      if (!reviewer) return;

      const status = request.body?.status;
      if (!status || !["accepted", "rejected", "deferred", "pending"].includes(status)) {
        return reply.code(400).send({ error: "Valid status required: accepted, rejected, deferred, pending" });
      }
      if ((status === "rejected" || status === "deferred") && !request.body?.rationale?.trim()) {
        return reply.code(400).send({ error: "rationale is required for rejected or deferred status" });
      }

      const existing = await store.getFindingReview(request.params.id, request.params.findingId);
      const review = {
        id: existing?.id ?? createId("review"),
        analysisId: request.params.id,
        findingId: request.params.findingId,
        workspaceId: ctx.project.workspaceId,
        status,
        rationale: request.body?.rationale?.trim(),
        deferUntil: request.body?.deferUntil,
        reviewedBy: request.user!.id,
        reviewedAt: new Date().toISOString(),
      };
      await store.saveFindingReview(review);
      await recordAudit({
        workspaceId: ctx.project.workspaceId,
        userId: request.user!.id,
        action: `finding.${status}`,
        resourceType: "finding",
        resourceId: request.params.findingId,
        metadata: { analysisId: request.params.id, rationale: review.rationale },
      });
      return { review };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/analyses/:id/report/submit",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      if (!ctx.analysis.artifacts) return reply.code(400).send({ error: "Report not ready" });

      const submitter = await requireWorkspaceAccess(
        request,
        reply,
        ctx.project.workspaceId,
        "analysis:trigger",
      );
      if (!submitter) return;

      const existing = await store.getReportApproval(request.params.id);
      const approval = {
        id: existing?.id ?? createId("approval"),
        analysisId: request.params.id,
        workspaceId: ctx.project.workspaceId,
        status: "pending_review" as ReportApprovalStatus,
        submittedBy: request.user!.id,
        submittedAt: new Date().toISOString(),
        analyzerVersion: ctx.analysis.artifacts.analyzerVersion ?? ANALYZER_VERSION,
      };
      await store.saveReportApproval(approval);
      await recordAudit({
        workspaceId: ctx.project.workspaceId,
        userId: request.user!.id,
        action: "report.submitted",
        resourceType: "analysis",
        resourceId: request.params.id,
      });
      return { approval };
    },
  );

  app.post<{ Params: { id: string }; Body: { action?: "approve" | "reject"; rationale?: string } }>(
    "/analyses/:id/report/approve",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      if (!ctx.analysis.artifacts) return reply.code(400).send({ error: "Report not ready" });

      const approver = await requireWorkspaceAccess(
        request,
        reply,
        ctx.project.workspaceId,
        "report:approve",
      );
      if (!approver) return;

      const action = request.body?.action ?? "approve";
      const existing = await store.getReportApproval(request.params.id);
      if (!existing || existing.status !== "pending_review") {
        return reply.code(400).send({ error: "Report must be submitted for review first" });
      }

      if (action === "reject" && !request.body?.rationale?.trim()) {
        return reply.code(400).send({ error: "rationale is required when rejecting a report" });
      }

      const report = await buildFullReport(request.params.id);
      if (!report) return reply.code(400).send({ error: "Report not ready" });

      const approval = {
        ...existing,
        status: (action === "approve" ? "approved" : "rejected") as ReportApprovalStatus,
        reviewedBy: request.user!.id,
        reviewedAt: new Date().toISOString(),
        rationale: request.body?.rationale?.trim(),
      };

      if (action === "approve") {
        approval.signature = signReport(report, approval);
        approval.signedAt = new Date().toISOString();
      }

      await store.saveReportApproval(approval);
      await recordAudit({
        workspaceId: ctx.project.workspaceId,
        userId: request.user!.id,
        action: action === "approve" ? "report.approved" : "report.rejected",
        resourceType: "analysis",
        resourceId: request.params.id,
        metadata: { rationale: approval.rationale },
      });

      return {
        approval,
        signatureValid: approval.signature ? verifyReportSignature(report, approval) : false,
      };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/analyses/:id/export/tasks",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const exporter = await requireWorkspaceAccess(
        request,
        reply,
        ctx.project.workspaceId,
        "task:export",
      );
      if (!exporter) return;

      const report = await buildFullReport(request.params.id);
      if (!report) return reply.code(404).send({ error: "Report not ready" });

      const format = (request.query.format ?? "csv") as TaskExportFormat;
      if (!["github", "jira", "linear", "csv"].includes(format)) {
        return reply.code(400).send({ error: "format must be github, jira, linear, or csv" });
      }

      const content = renderTaskExport(report, format);
      const contentType =
        format === "github" || format === "linear"
          ? "application/json; charset=utf-8"
          : "text/csv; charset=utf-8";

      reply.header("content-type", contentType);
      reply.header(
        "content-disposition",
        `attachment; filename="codetruth-tasks-${request.params.id}.${format === "github" || format === "linear" ? "json" : "csv"}"`,
      );
      return content;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/analyses/:id/export/findings.csv",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const report = await buildFullReport(request.params.id);
      if (!report) return reply.code(404).send({ error: "Report not ready" });
      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header("content-disposition", `attachment; filename="codetruth-findings-${request.params.id}.csv"`);
      return renderFindingsCsv(report.findings);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/analyses/:id/report.html",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const report = await buildFullReport(request.params.id);
      if (!report) return reply.code(404).send({ error: "Report not ready" });
      reply.header("content-type", "text/html; charset=utf-8");
      return renderHtmlReport(report);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/analyses/:id/report/signature",
    { preHandler: authenticate },
    async (request, reply) => {
      const ctx = await resolveAnalysisContext(request.params.id, request, reply);
      if (!ctx) return;
      const approval = await store.getReportApproval(request.params.id);
      if (!approval?.signature) return reply.code(404).send({ error: "Report is not signed" });
      const report = await buildFullReport(request.params.id);
      if (!report) return reply.code(404).send({ error: "Report not ready" });
      return {
        signature: approval.signature,
        signedAt: approval.signedAt,
        analyzerVersion: approval.analyzerVersion,
        valid: verifyReportSignature(report, approval),
      };
    },
  );

}