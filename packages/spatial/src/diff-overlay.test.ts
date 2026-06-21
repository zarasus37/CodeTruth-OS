import { describe, expect, it } from "vitest";
import type { SpatialGraph } from "@codetruth/core";
import { applySpatialDiffOverlay } from "./diff-overlay.js";

const baseGraph: SpatialGraph = {
  nodes: [
    {
      id: "f1",
      kind: "file",
      label: "a.go",
      filePath: "a.go",
      position: { x: 0, y: 0, z: 0 },
    },
    {
      id: "s1",
      kind: "symbol",
      label: "Hello",
      filePath: "a.go",
      position: { x: 1, y: 0, z: 0 },
      meta: { symbolKind: "function" },
    },
  ],
  edges: [],
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } },
  layers: [],
};

describe("applySpatialDiffOverlay", () => {
  it("marks added and modified nodes", () => {
    const overlay = applySpatialDiffOverlay(baseGraph, {
      baseSnapshotId: "snap_a",
      targetSnapshotId: "snap_b",
      added: [{ path: "b.go", hash: "1", size: 10 }],
      removed: [],
      modified: [{ path: "a.go", beforeHash: "1", afterHash: "2", sizeDelta: 0 }],
      unchanged: 0,
      changeRatio: 0.5,
      symbolChanges: [
        { name: "Hello", kind: "function", filePath: "a.go", change: "modified" },
      ],
      driftScore: 0.5,
    });

    const fileNode = overlay.nodes.find((n) => n.filePath === "a.go");
    expect(fileNode?.diffState).toBe("modified");
    const symbolNode = overlay.nodes.find((n) => n.label === "Hello");
    expect(symbolNode?.diffState).toBe("modified");
    expect(overlay.diffOverlay?.driftScore).toBe(0.5);
  });
});