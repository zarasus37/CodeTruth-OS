import path from "node:path";
import { createId } from "@codetruth/core";
import type {
  ArchitectureGraph,
  ConfidenceLevel,
  DependencyEdge,
  EvidenceRecord,
  ServiceNode,
  SnapshotRecord,
  SymbolRecord,
} from "@codetruth/core";

function topLevelModule(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length > 1 && ["src", "apps", "packages", "lib"].includes(parts[0] ?? "")) {
    return `${parts[0]}/${parts[1] ?? "root"}`;
  }
  return parts[0] ?? "root";
}

export function reconstructArchitecture(
  snapshot: SnapshotRecord,
  symbols: SymbolRecord[],
  dependencies: DependencyEdge[],
): ArchitectureGraph {
  const moduleNames = new Set<string>();
  for (const entry of snapshot.manifest) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb)$/i.test(entry.path)) {
      moduleNames.add(topLevelModule(entry.path));
    }
  }

  const hasPackageJson = snapshot.manifest.some((entry) => entry.path === "package.json");
  const hasDocker = snapshot.manifest.some((entry) =>
    entry.path.toLowerCase().includes("dockerfile") || entry.path.endsWith("docker-compose.yml"),
  );

  const services: ServiceNode[] = [
    {
      id: createId("svc"),
      name: hasPackageJson ? "application" : "codebase",
      confidence: (hasPackageJson ? "Confirmed" : "Strongly Inferred") as ConfidenceLevel,
      evidence: [
        {
          snapshotHash: snapshot.hash,
          filePath: hasPackageJson ? "package.json" : snapshot.manifest[0]?.path ?? "unknown",
          extractionMethod: "config_parse" satisfies EvidenceRecord["extractionMethod"],
          snippet: hasPackageJson ? "package.json present" : "source files detected",
        },
      ],
    },
  ];

  if (hasDocker) {
    services.push({
      id: createId("svc"),
      name: "container-runtime",
      confidence: "Confirmed",
      evidence: [
        {
          snapshotHash: snapshot.hash,
          filePath: snapshot.manifest.find((entry) => entry.path.toLowerCase().includes("dockerfile"))?.path ?? "Dockerfile",
          extractionMethod: "config_parse" satisfies EvidenceRecord["extractionMethod"],
          snippet: "Container configuration detected",
        },
      ],
    });
  }

  const modules = [...moduleNames].map((name) => ({
    id: createId("mod"),
    name,
    serviceId: services[0]?.id,
    confidence: "Strongly Inferred" as ConfidenceLevel,
  }));

  const edges = dependencies.slice(0, 250).map((dep) => ({
    from: dep.from,
    to: dep.to,
    kind: dep.kind,
    confidence: (dep.to.startsWith(".") ? "Confirmed" : "Weakly Inferred") as ConfidenceLevel,
  }));

  const symbolCount = symbols.length;
  if (symbolCount > 0 && services[0]) {
    services[0].evidence.push({
      snapshotHash: snapshot.hash,
      filePath: symbols[0]?.filePath ?? "unknown",
      extractionMethod: "AST" satisfies EvidenceRecord["extractionMethod"],
      snippet: `${symbolCount} symbols extracted`,
    });
  }

  return { services, modules, edges };
}