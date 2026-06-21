import { createId } from "@codetruth/core";
import type {
  ConfidenceLevel,
  DependencyEdge,
  EvidenceRecord,
  SymbolRecord,
} from "@codetruth/core";

export type ParseEngineKind = "babel" | "treesitter" | "pattern";

export interface ParseEvidenceContext {
  snapshotHash: string;
  engine: ParseEngineKind;
  parserEngine: string;
}

function extractionMethod(engine: ParseEngineKind): EvidenceRecord["extractionMethod"] {
  return engine === "pattern" ? "pattern_match" : "AST";
}

export function confidenceForSymbol(engine: ParseEngineKind): ConfidenceLevel {
  return engine === "pattern" ? "Strongly Inferred" : "Confirmed";
}

export function confidenceForDependency(
  kind: DependencyEdge["kind"],
  resolvedTo?: string,
  engine: ParseEngineKind = "babel",
): ConfidenceLevel {
  if (kind === "imports" && resolvedTo) return "Confirmed";
  if (kind === "imports") return engine === "pattern" ? "Strongly Inferred" : "Confirmed";
  return "Weakly Inferred";
}

function buildEvidence(input: {
  ctx: ParseEvidenceContext;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  symbolId?: string;
  snippet?: string;
}): EvidenceRecord[] {
  const rawSnippet = input.snippet ?? "";
  const confidenceAtExtraction = confidenceForSymbol(input.ctx.engine);
  const record: EvidenceRecord = {
    snapshotHash: input.ctx.snapshotHash,
    filePath: input.filePath,
    lineStart: input.lineStart,
    lineEnd: input.lineEnd,
    symbolId: input.symbolId,
    rawSnippet,
    snippet: rawSnippet.slice(0, 240),
    extractionMethod: extractionMethod(input.ctx.engine),
    confidenceAtExtraction,
  };
  return [record];
}

export function makeSymbol(input: {
  ctx: ParseEvidenceContext;
  name: string;
  kind: SymbolRecord["kind"];
  filePath: string;
  line?: number;
  lineEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  snippet?: string;
}): SymbolRecord {
  const id = createId("sym");
  const chain = buildEvidence({
    ctx: input.ctx,
    filePath: input.filePath,
    lineStart: input.line,
    lineEnd: input.lineEnd,
    symbolId: id,
    snippet: input.snippet ?? `${input.kind} ${input.name}`,
  }).map((record) => ({ ...record, symbolName: input.name }));

  return {
    id,
    name: input.name,
    kind: input.kind,
    filePath: input.filePath,
    line: input.line,
    lineEnd: input.lineEnd,
    columnStart: input.columnStart,
    columnEnd: input.columnEnd,
    confidence: confidenceForSymbol(input.ctx.engine),
    evidence: chain,
    evidenceChain: chain,
    parserEngine: input.ctx.parserEngine,
  };
}

export function makeDependency(input: {
  ctx: ParseEvidenceContext;
  from: string;
  to: string;
  kind: DependencyEdge["kind"];
  line?: number;
  resolvedTo?: string;
  snippet?: string;
}): DependencyEdge {
  const depConfidence = confidenceForDependency(input.kind, input.resolvedTo, input.ctx.engine);
  const chain = buildEvidence({
    ctx: input.ctx,
    filePath: input.from,
    lineStart: input.line,
    snippet:
      input.snippet ??
      `${input.kind} ${input.to}${input.resolvedTo ? ` → ${input.resolvedTo}` : ""}`,
  }).map((record) => ({ ...record, confidenceAtExtraction: depConfidence }));

  return {
    from: input.from,
    to: input.to,
    kind: input.kind,
    resolvedTo: input.resolvedTo,
    line: input.line,
    confidence: confidenceForDependency(input.kind, input.resolvedTo, input.ctx.engine),
    evidence: chain,
    evidenceChain: chain,
  };
}