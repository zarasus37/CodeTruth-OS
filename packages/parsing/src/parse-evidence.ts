import {
  createEvidenceFromDependency,
  createEvidenceFromSymbol,
  enrichEvidenceRecord,
} from "@codetruth/core";
import type { DependencyEdge, EvidenceRecord, ParseEvidenceLedger, SymbolRecord } from "@codetruth/core";

export function buildEvidenceFromParseResult(input: {
  snapshotHash: string;
  symbols: SymbolRecord[];
  dependencies: DependencyEdge[];
}): ParseEvidenceLedger {
  const records: EvidenceRecord[] = [];
  const byFile: Record<string, EvidenceRecord[]> = {};

  const push = (record: EvidenceRecord) => {
    const enriched = enrichEvidenceRecord(record);
    records.push(enriched);
    const file = enriched.filePath.replace(/\\/g, "/");
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(enriched);
  };

  for (const symbol of input.symbols) {
    push(createEvidenceFromSymbol(symbol, input.snapshotHash));
    for (const link of symbol.evidenceChain.slice(1)) {
      push(enrichEvidenceRecord({ ...link, snapshotHash: input.snapshotHash }));
    }
  }

  for (const edge of input.dependencies) {
    push(createEvidenceFromDependency(edge, input.snapshotHash));
  }

  return {
    records,
    byFile,
    symbolCount: input.symbols.length,
    dependencyCount: input.dependencies.length,
  };
}