import type {
  ArchitectureGraph,
  ArchitectureGraphLifecycleState,
  Finding,
  FindingLifecycleState,
  SnapshotLifecycleState,
  SnapshotRecord,
} from "./types.js";

export type {
  ArchitectureGraphLifecycleState,
  FindingLifecycleState,
  SnapshotLifecycleState,
} from "./types.js";

/** Finding lifecycle — enforced as findings move through the pipeline. */
export const FINDING_LIFECYCLE_ORDER: readonly FindingLifecycleState[] = [
  "Created",
  "EvidenceEnforced",
  "CouncilReviewed",
  "Finalized",
] as const;

const FINDING_TRANSITIONS: Record<FindingLifecycleState, FindingLifecycleState[]> = {
  Created: ["EvidenceEnforced"],
  EvidenceEnforced: ["CouncilReviewed"],
  CouncilReviewed: ["Finalized"],
  Finalized: [],
};

export const SNAPSHOT_LIFECYCLE_ORDER: readonly SnapshotLifecycleState[] = [
  "Captured",
  "Parsed",
  "Analyzed",
  "Archived",
] as const;

export const ARCHITECTURE_LIFECYCLE_ORDER: readonly ArchitectureGraphLifecycleState[] = [
  "Reconstructed",
  "Spatialized",
  "CouncilReady",
  "Finalized",
] as const;

export function isFindingLifecycleState(value: unknown): value is FindingLifecycleState {
  return (
    typeof value === "string" &&
    (FINDING_LIFECYCLE_ORDER as readonly string[]).includes(value)
  );
}

export function canTransitionFinding(
  from: FindingLifecycleState | undefined,
  to: FindingLifecycleState,
): boolean {
  const current = from ?? "Created";
  if (current === to) return true;
  return FINDING_TRANSITIONS[current].includes(to);
}

export function transitionFindingState(
  from: FindingLifecycleState | undefined,
  to: FindingLifecycleState,
): FindingLifecycleState {
  if (!canTransitionFinding(from, to)) {
    throw new Error(
      `Invalid finding lifecycle transition: ${from ?? "Created"} → ${to}`,
    );
  }
  return to;
}

export function advanceFinding(finding: Finding, to: FindingLifecycleState): Finding {
  return {
    ...finding,
    lifecycleState: transitionFindingState(finding.lifecycleState, to),
  };
}

export function advanceFindings(
  findings: Finding[],
  to: FindingLifecycleState,
): Finding[] {
  return findings.map((finding) => advanceFinding(finding, to));
}

export function initialFindingLifecycle(): FindingLifecycleState {
  return "Created";
}

export interface SnapshotWithLifecycle extends SnapshotRecord {
  lifecycleState?: SnapshotLifecycleState;
}

export interface ArchitectureGraphWithLifecycle extends ArchitectureGraph {
  lifecycleState?: ArchitectureGraphLifecycleState;
}

export function canTransitionSnapshot(
  from: SnapshotLifecycleState | undefined,
  to: SnapshotLifecycleState,
): boolean {
  const order = SNAPSHOT_LIFECYCLE_ORDER;
  const fromIdx = from ? order.indexOf(from) : 0;
  const toIdx = order.indexOf(to);
  return toIdx === fromIdx || toIdx === fromIdx + 1;
}

export function canTransitionArchitecture(
  from: ArchitectureGraphLifecycleState | undefined,
  to: ArchitectureGraphLifecycleState,
): boolean {
  const order = ARCHITECTURE_LIFECYCLE_ORDER;
  const fromIdx = from ? order.indexOf(from) : 0;
  const toIdx = order.indexOf(to);
  return toIdx === fromIdx || toIdx === fromIdx + 1;
}