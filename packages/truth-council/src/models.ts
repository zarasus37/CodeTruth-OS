import type { CouncilFindingContext, Finding } from "@codetruth/core";

export const COUNCIL_MODELS = [
  "Architecture Model",
  "Runtime Model",
  "DevOps Model",
  "Security Model",
  "Planning Model",
] as const;

export type CouncilModel = (typeof COUNCIL_MODELS)[number];

export function modelFindings(
  model: CouncilModel,
  findings: CouncilFindingContext[] | Finding[],
): CouncilFindingContext[] {
  const asContext = (f: CouncilFindingContext | Finding): CouncilFindingContext =>
    "evidenceChain" in f && Array.isArray(f.evidenceChain)
      ? (f as CouncilFindingContext)
      : {
          id: f.id,
          title: f.title,
          severity: f.severity,
          domain: f.domain,
          confidence: f.confidence,
          description: f.description,
          gapCategory: f.gapCategory,
          evidenceChain:
            (f as Finding).evidenceChain?.length
              ? (f as Finding).evidenceChain
              : (f as Finding).evidence,
        };

  const items = findings.map(asContext);

  switch (model) {
    case "Architecture Model":
      return items.filter(
        (f) => f.domain === "code structure" || f.domain === "integration health",
      );
    case "Runtime Model":
      return items.filter(
        (f) => f.domain === "runtime readiness" || f.domain === "build readiness",
      );
    case "DevOps Model":
      return items.filter(
        (f) => f.domain === "DevOps maturity" || f.domain === "observability",
      );
    case "Security Model":
      return items.filter((f) => f.domain === "security posture");
    case "Planning Model":
      return items;
  }
}