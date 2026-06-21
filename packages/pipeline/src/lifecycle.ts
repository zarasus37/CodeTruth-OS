import {
  advanceFinding,
  advanceFindings,
  canTransitionFinding,
  FINDING_LIFECYCLE_ORDER,
  transitionFindingState,
} from "@codetruth/core";
import type { Finding, FindingLifecycleState } from "@codetruth/core";

export interface LifecycleTransitionAudit {
  findingId: string;
  from: FindingLifecycleState;
  to: FindingLifecycleState;
  allowed: boolean;
  error?: string;
}

export function currentFindingState(finding: Finding): FindingLifecycleState {
  return finding.lifecycleState ?? "Created";
}

export function assertFindingsAtLeast(
  findings: Finding[],
  minimum: FindingLifecycleState,
): void {
  const minIdx = FINDING_LIFECYCLE_ORDER.indexOf(minimum);
  for (const finding of findings) {
    const state = currentFindingState(finding);
    const idx = FINDING_LIFECYCLE_ORDER.indexOf(state);
    if (idx < minIdx) {
      throw new Error(
        `Finding ${finding.id} lifecycle ${state} is below required ${minimum}`,
      );
    }
  }
}

/** Advance findings with explicit transition validation and audit trail. */
export function advanceFindingsGuarded(
  findings: Finding[],
  to: FindingLifecycleState,
): { findings: Finding[]; audits: LifecycleTransitionAudit[] } {
  const audits: LifecycleTransitionAudit[] = [];
  const updated: Finding[] = [];

  for (const finding of findings) {
    const from = currentFindingState(finding);
    const allowed = canTransitionFinding(from, to);
    audits.push({
      findingId: finding.id,
      from,
      to,
      allowed,
      error: allowed ? undefined : `Invalid transition ${from} → ${to}`,
    });

    if (!allowed) {
      throw new Error(`Invalid finding lifecycle transition: ${from} → ${to} (${finding.id})`);
    }

    updated.push(advanceFinding(finding, to));
  }

  return { findings: updated, audits };
}

export function previewLifecycleTransition(
  from: FindingLifecycleState | undefined,
  to: FindingLifecycleState,
): { allowed: boolean; next: FindingLifecycleState } {
  const allowed = canTransitionFinding(from, to);
  return {
    allowed,
    next: allowed ? transitionFindingState(from, to) : (from ?? "Created"),
  };
}

export { advanceFindings, advanceFinding, canTransitionFinding };