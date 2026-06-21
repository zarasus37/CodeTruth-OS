import { buildModelContext as buildCoreModelContext } from "@codetruth/core";
import type { CouncilEvidenceBundle, CouncilModelContext } from "@codetruth/core";
import { modelFindings, type CouncilModel } from "./models.js";

export { serializeModelContextForLlm } from "@codetruth/core";

export function buildModelContext(
  bundle: CouncilEvidenceBundle,
  model: CouncilModel,
): CouncilModelContext {
  const scoped = modelFindings(model, bundle.findings);
  return buildCoreModelContext(bundle, model, scoped);
}