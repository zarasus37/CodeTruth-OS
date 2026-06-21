import type { FastifyInstance } from "fastify";
import {
  createId,
  type ComplianceFramework,
  type GapCategory,
  type ScoringDomain,
  type SeverityLevel,
} from "@codetruth/core";
import { COMPLIANCE_FRAMEWORKS, renderAuditorReport, renderComplianceCsv } from "@codetruth/compliance";
import { authenticate } from "./auth.js";
import { buildWorkspaceInstitutionalView } from "./cognition-helpers.js";
import { store } from "./context.js";
import { recordAudit, requireWorkspaceAccess } from "./rbac.js";

const FRAMEWORK_SET = new Set<string>(COMPLIANCE_FRAMEWORKS);

const SCORING_DOMAINS = new Set<ScoringDomain>([
  "code structure",
  "build readiness",
  "runtime readiness",
  "test maturity",
  "security posture",
  "DevOps maturity",
  "observability",
  "documentation",
  "product completeness",
  "integration health",
]);

const SEVERITY_LEVELS = new Set<SeverityLevel>([
  "Critical blocker",
  "High-risk flaw",
  "Medium-priority weakness",
  "Low-priority debt",
  "Informational observation",
]);

export async function registerComplianceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/compliance",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      const view = await buildWorkspaceInstitutionalView(request.params.workspaceId);
      return {
        workspaceId: request.params.workspaceId,
        compliance: view.compliance,
        maturityDistribution: view.maturityDistribution,
        driftAlerts: view.driftAlerts,
      };
    },
  );

  app.get<{
    Params: { workspaceId: string };
    Querystring: { format?: string };
  }>(
    "/workspaces/:workspaceId/compliance/export",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      const view = await buildWorkspaceInstitutionalView(request.params.workspaceId);
      const format = request.query.format?.toLowerCase() ?? "csv";

      if (format === "json") {
        return renderAuditorReport(view);
      }

      const csv = renderComplianceCsv(view.compliance);
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header(
        "Content-Disposition",
        `attachment; filename="compliance-${request.params.workspaceId}.csv"`,
      );
      return csv;
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/compliance/policies",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      return {
        policies: await store.listCustomCompliancePolicies(request.params.workspaceId),
      };
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      title?: string;
      description?: string;
      domains?: ScoringDomain[];
      gapCategories?: GapCategory[];
      severityThreshold?: SeverityLevel;
    };
  }>(
    "/workspaces/:workspaceId/compliance/policies",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:approve",
      );
      if (!member) return;

      const title = request.body?.title?.trim();
      const description = request.body?.description?.trim();
      const domains = request.body?.domains ?? [];
      const severityThreshold = request.body?.severityThreshold ?? "Medium-priority weakness";

      if (!title || !description) {
        return reply.code(400).send({ error: "title and description are required" });
      }
      if (!domains.length || domains.some((d) => !SCORING_DOMAINS.has(d))) {
        return reply.code(400).send({ error: "At least one valid scoring domain is required" });
      }
      if (!SEVERITY_LEVELS.has(severityThreshold)) {
        return reply.code(400).send({ error: "Invalid severity threshold" });
      }

      const policy = {
        id: createId("policy"),
        workspaceId: request.params.workspaceId,
        title,
        description,
        domains,
        gapCategories: request.body?.gapCategories,
        severityThreshold,
        createdAt: new Date().toISOString(),
        createdBy: request.user!.id,
      };

      await store.saveCustomCompliancePolicy(policy);
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "compliance.policy_created",
        resourceType: "custom_compliance_policy",
        resourceId: policy.id,
        metadata: { title: policy.title },
      });

      return reply.code(201).send({ policy });
    },
  );

  app.put<{
    Params: { workspaceId: string; policyId: string };
    Body: {
      title?: string;
      description?: string;
      domains?: ScoringDomain[];
      gapCategories?: GapCategory[];
      severityThreshold?: SeverityLevel;
    };
  }>(
    "/workspaces/:workspaceId/compliance/policies/:policyId",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:approve",
      );
      if (!member) return;

      const policies = await store.listCustomCompliancePolicies(request.params.workspaceId);
      const existing = policies.find((p) => p.id === request.params.policyId);
      if (!existing) {
        return reply.code(404).send({ error: "Policy not found" });
      }

      const domains = request.body?.domains ?? existing.domains;
      const severityThreshold = request.body?.severityThreshold ?? existing.severityThreshold;

      if (request.body?.domains && (!domains.length || domains.some((d) => !SCORING_DOMAINS.has(d)))) {
        return reply.code(400).send({ error: "At least one valid scoring domain is required" });
      }
      if (!SEVERITY_LEVELS.has(severityThreshold)) {
        return reply.code(400).send({ error: "Invalid severity threshold" });
      }

      const policy = {
        ...existing,
        title: request.body?.title?.trim() || existing.title,
        description: request.body?.description?.trim() || existing.description,
        domains,
        gapCategories: request.body?.gapCategories ?? existing.gapCategories,
        severityThreshold,
      };

      await store.saveCustomCompliancePolicy(policy);
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "compliance.policy_updated",
        resourceType: "custom_compliance_policy",
        resourceId: policy.id,
        metadata: { title: policy.title },
      });

      return { policy };
    },
  );

  app.delete<{ Params: { workspaceId: string; policyId: string } }>(
    "/workspaces/:workspaceId/compliance/policies/:policyId",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:approve",
      );
      if (!member) return;

      const policies = await store.listCustomCompliancePolicies(request.params.workspaceId);
      if (!policies.some((p) => p.id === request.params.policyId)) {
        return reply.code(404).send({ error: "Policy not found" });
      }

      await store.deleteCustomCompliancePolicy(
        request.params.workspaceId,
        request.params.policyId,
      );
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "compliance.policy_deleted",
        resourceType: "custom_compliance_policy",
        resourceId: request.params.policyId,
      });

      return reply.code(204).send(null);
    },
  );

  app.post<{
    Params: { workspaceId: string };
    Body: {
      framework?: ComplianceFramework;
      projectId?: string;
      notes?: string;
      expiresAt?: string;
    };
  }>(
    "/workspaces/:workspaceId/compliance/attest",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:approve",
      );
      if (!member) return;

      const framework = request.body?.framework;
      if (!framework || !FRAMEWORK_SET.has(framework)) {
        return reply.code(400).send({ error: "Valid framework is required" });
      }

      const attestation = {
        id: createId("attest"),
        workspaceId: request.params.workspaceId,
        projectId: request.body?.projectId,
        framework,
        attestedBy: request.user!.id,
        attestedAt: new Date().toISOString(),
        expiresAt: request.body?.expiresAt,
        notes: request.body?.notes,
      };

      await store.saveComplianceAttestation(attestation);
      await recordAudit({
        workspaceId: request.params.workspaceId,
        userId: request.user!.id,
        action: "compliance.attested",
        resourceType: "compliance_attestation",
        resourceId: attestation.id,
        metadata: { framework, projectId: attestation.projectId },
      });

      return reply.code(201).send({ attestation });
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/compliance/attestations",
    { preHandler: authenticate },
    async (request, reply) => {
      const member = await requireWorkspaceAccess(
        request,
        reply,
        request.params.workspaceId,
        "report:view",
      );
      if (!member) return;

      return { attestations: await store.listComplianceAttestations(request.params.workspaceId) };
    },
  );
}