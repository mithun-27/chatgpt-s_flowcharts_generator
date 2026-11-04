import type {
  AiDiagram,
  DiagramAnalysis,
  FlowDiagram,
  InputKind,
  LayoutDirection,
  QualityReport,
} from '../types/diagram';
import type { InputClassification } from './classifyInput';
import { classifyInput } from './classifyInput';
import { analyzeGraph, repairDiagram } from './graphEngine';
import { refineDiagramShapes } from './shapes';
import { understandWorkflow, type UnderstandingResult } from './understand';
import { normalizeAiDiagram } from '../utils/diagram';
import { parseAsciiFlowchart } from '../utils/asciiFlow';
import { parseMermaid } from '../utils/mermaid';
import { textToDiagram } from '../utils/textToFlow';
import { layoutDiagramBest } from '../editor/elkLayout';
import {
  extractActors,
  extractSystems,
  extractTitleAndBody,
  inferCategory,
  normalizeLabelForCompare,
  splitSentences,
  stripMarkdownInline,
} from './nlp';

export type AnalysisEngine = DiagramAnalysis['engine'];

export interface IntelligenceResult {
  diagram: FlowDiagram;
  classification: InputClassification;
  analysis: DiagramAnalysis;
  warnings: string[];
  notes: string[];
}

export interface IntelligenceOptions {
  direction?: LayoutDirection;
  /** Optional source text used for provenance and metadata. */
  sourceText?: string;
  engine?: AnalysisEngine;
  inputKind?: InputKind;
  inputConfidence?: number;
  aiAnalysis?: Partial<DiagramAnalysis>;
  classification?: InputClassification;
  /** Extra warnings from earlier stages (e.g. OCR) merged into the analysis. */
  warnings?: string[];
  /** Extra assumptions from earlier stages merged into the analysis. */
  assumptions?: string[];
  /** Extra questions from earlier stages merged into the analysis. */
  questions?: string[];
  /** Extra engine notes from earlier stages merged into the analysis. */
  notes?: string[];
}

const OBJECTIVE_START =
  /^(?:build|create|design|develop|implement|make|launch|generate|set up|plan|automate|architect)\b/i;

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function objectiveFromText(text: string): string | undefined {
  const explicit = text.match(/(?:^|\n)\s*(?:objective|goal|purpose)\s*[:：]\s*(.+)/i);
  if (explicit?.[1]) return stripMarkdownInline(explicit[1]).trim();
  const build = splitSentences(text).find((sentence) =>
    OBJECTIVE_START.test(stripMarkdownInline(sentence).trim()),
  );
  return build ? stripMarkdownInline(build).replace(/[.!]+$/, '').trim() : undefined;
}

function problemFromText(text: string): string | undefined {
  const match = text.match(/(?:^|\n)\s*(?:problem|pain point|challenge)\s*[:：]\s*(.+)/i);
  return match?.[1]?.trim();
}

function outcomeFromText(text: string): string | undefined {
  const match = text.match(/(?:^|\n)\s*(?:expected outcome|outcome|success criteria|result)\s*[:：]\s*(.+)/i);
  return match?.[1]?.trim();
}

function metadataFromText(text: string, understanding?: UnderstandingResult): {
  objective?: string;
  problem?: string;
  outcome?: string;
  category: string;
  actors: string[];
  systems: string[];
  inputs: string[];
  outputs: string[];
} {
  const body = extractTitleAndBody(text).body;
  return {
    objective: understanding?.objective ?? objectiveFromText(text),
    problem: understanding?.problem ?? problemFromText(text),
    outcome: understanding?.outcome ?? outcomeFromText(text),
    category: understanding?.category ?? inferCategory(body),
    actors: understanding?.actors ?? extractActors(body),
    systems: understanding?.systems ?? extractSystems(body),
    inputs: understanding?.inputs ?? [],
    outputs: understanding?.outputs ?? [],
  };
}

function qualityOf(diagram: FlowDiagram): QualityReport {
  const report = analyzeGraph(diagram);
  return {
    score: report.score,
    nodeCount: report.nodeCount,
    edgeCount: report.edgeCount,
    decisionCount: report.decisionCount,
    cyclic: report.cyclic,
    cycleCount: report.cycleCount,
    cycleNodes: report.cycleNodes,
    disconnectedComponents: report.disconnectedComponents,
    unreachableNodes: report.unreachableNodes,
    duplicateNodes: report.duplicateNodes,
    unlabeledBranches: report.unlabeledBranches,
    warnings: report.warnings,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 12);
}

function decorateProvenance(diagram: FlowDiagram, sourceText?: string): FlowDiagram {
  if (!sourceText) return diagram;
  const source = normalizeLabelForCompare(sourceText);
  if (!source) return diagram;
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      if (node.data.provenance) return node;
      const label = normalizeLabelForCompare(node.data.label);
      const words = label.split(' ').filter((word) => word.length > 2);
      const matches = words.filter((word) => source.includes(word)).length;
      const explicit = words.length === 0 ? false : matches / words.length >= 0.6;
      return {
        ...node,
        data: {
          ...node.data,
          provenance: explicit ? 'explicit' : 'inferred',
          confidence: node.data.confidence ?? (explicit ? 0.88 : 0.7),
          rationale:
            node.data.rationale ??
            (explicit
              ? 'Mentioned in the source text.'
              : 'Inferred by the reasoning engine to keep the graph connected.'),
        },
      };
    }),
  };
}

function finalize(
  base: FlowDiagram,
  options: IntelligenceOptions,
  extra: {
    objective?: string;
    problem?: string;
    outcome?: string;
    category?: string;
    actors?: string[];
    systems?: string[];
    inputs?: string[];
    outputs?: string[];
    assumptions: string[];
    questions: string[];
    warnings: string[];
    notes: string[];
    engine: AnalysisEngine;
    inputKind: InputKind;
    inputConfidence: number;
  },
): IntelligenceResult {
  const refined = refineDiagramShapes(decorateProvenance(base, options.sourceText));
  const repaired = repairDiagram(refined.diagram);
  const analysis: DiagramAnalysis = {
    inputKind: extra.inputKind,
    inputConfidence: extra.inputConfidence,
    ...(extra.objective ? { objective: extra.objective } : {}),
    ...(extra.problem ? { problem: extra.problem } : {}),
    ...(extra.category ? { category: extra.category } : {}),
    actors: extra.actors ?? [],
    systems: extra.systems ?? [],
    inputs: extra.inputs ?? [],
    outputs: extra.outputs ?? [],
    ...(extra.outcome ? { outcome: extra.outcome } : {}),
    assumptions: unique([...extra.assumptions, ...(options.aiAnalysis?.assumptions ?? [])]),
    questions: unique(extra.questions),
    warnings: unique([
      ...extra.warnings,
      ...(options.aiAnalysis?.warnings ?? []),
      ...refined.notes,
      ...repaired.warnings,
    ]),
    engine: extra.engine,
  };

  // The quality report is filled after layout so it reflects the final graph.
  const withAnalysis: FlowDiagram = { ...repaired.diagram, analysis };
  const warnings = analysis.warnings;

  return {
    diagram: withAnalysis,
    classification:
      options.classification ?? {
        kind: extra.inputKind,
        confidence: extra.inputConfidence,
        scores: {} as Record<InputKind, number>,
        signals: [],
      },
    analysis: { ...analysis, warnings },
    warnings,
    notes: extra.notes,
  };
}

/** Finalises a graph (local, Mermaid, ASCII or AI) with shape refinement, self-check, repair and layout. */
export async function finalizeIntelligence(
  base: FlowDiagram,
  options: IntelligenceOptions & {
    assumptions?: string[];
    questions?: string[];
    warnings?: string[];
    notes?: string[];
    objective?: string;
    problem?: string;
    outcome?: string;
    category?: string;
    actors?: string[];
    systems?: string[];
    inputs?: string[];
    outputs?: string[];
  } = {},
): Promise<IntelligenceResult> {
  const sourceText = options.sourceText ?? '';
  const meta = metadataFromText(sourceText);
  const engine = options.engine ?? 'local';
  const classification = options.classification ?? classifyInput(sourceText);

  const result = finalize(
    { ...base, direction: options.direction ?? base.direction },
    { ...options, classification },
    {
      objective: options.objective ?? meta.objective,
      problem: options.problem ?? meta.problem,
      outcome: options.outcome ?? meta.outcome,
      category: options.category ?? meta.category,
      actors: options.actors ?? meta.actors,
      systems: options.systems ?? meta.systems,
      inputs: options.inputs ?? meta.inputs,
      outputs: options.outputs ?? meta.outputs,
      assumptions:
        options.assumptions ??
        (engine === 'local'
          ? ['Built with the local deterministic reasoning engine (no AI credentials needed).']
          : []),
      questions: options.questions ?? [],
      warnings: options.warnings ?? [],
      notes: options.notes ?? [],
      engine,
      inputKind: options.inputKind ?? classification.kind,
      inputConfidence: options.inputConfidence ?? classification.confidence,
    },
  );

  const laidOut = await layoutDiagramBest(result.diagram, options.direction ?? result.diagram.direction);
  const quality = qualityOf(laidOut);
  const analysis: DiagramAnalysis = {
    ...result.analysis,
    quality,
    warnings: unique([...result.analysis.warnings, ...quality.warnings]),
  };
  const diagram: FlowDiagram = { ...laidOut, analysis };

  return { ...result, diagram, analysis, warnings: analysis.warnings };
}

/** Local understanding path. Handles Mermaid, ASCII, prose, lists and docs. */
export async function buildLocalIntelligence(
  text: string,
  options: { direction?: LayoutDirection } = {},
): Promise<IntelligenceResult> {
  const direction = options.direction ?? 'TB';
  const classification = classifyInput(text);
  const sourceText = text;

  if (classification.kind === 'mermaid') {
    const parsed = parseMermaid(text);
    return finalizeIntelligence(parsed, {
      direction,
      sourceText,
      classification,
      engine: 'local',
      inputKind: 'mermaid',
      assumptions: ['Parsed Mermaid syntax directly without an AI model.'],
      notes: ['Mermaid graph structure preserved.'],
    });
  }

  if (classification.kind === 'ascii') {
    const parsed = parseAsciiFlowchart(text, direction);
    const normalized = normalizeAiDiagram(parsed, direction);
    return finalizeIntelligence(normalized.diagram, {
      direction,
      sourceText,
      classification,
      engine: 'local',
      inputKind: 'ascii',
      assumptions: ['Rebuilt the ASCII diagram from box and connector geometry.'],
      warnings: normalized.warnings,
      notes: ['ASCII geometry parsed locally; the screenshot/text is not used as the output image.'],
    });
  }

  try {
    const understanding = understandWorkflow(text, direction);
    const normalized = normalizeAiDiagram(understanding.diagram, direction);
    return finalizeIntelligence(normalized.diagram, {
      direction,
      sourceText,
      classification,
      engine: 'local',
      inputKind: classification.kind,
      inputConfidence: classification.confidence,
      objective: understanding.objective,
      problem: understanding.problem,
      outcome: understanding.outcome,
      category: understanding.category,
      actors: understanding.actors,
      systems: understanding.systems,
      inputs: understanding.inputs,
      outputs: understanding.outputs,
      assumptions: understanding.assumptions,
      questions: understanding.questions,
      warnings: [...understanding.warnings, ...normalized.warnings],
      notes: understanding.notes,
    });
  } catch (error) {
    // Preserve the proven legacy parser as a safety net for unusual text.
    const legacy = textToDiagram(text, { direction });
    return finalizeIntelligence(legacy, {
      direction,
      sourceText,
      classification,
      engine: 'local',
      inputKind: classification.kind,
      assumptions: [
        'Fell back to the conservative line parser because the semantic parser could not infer a complete workflow.',
      ],
      warnings: [
        error instanceof Error ? error.message : 'Semantic parsing failed; used the fallback parser.',
      ],
    });
  }
}

/** Finalises a deterministic understanding result (used by the OCR path). */
export async function buildIntelligenceFromUnderstanding(
  understanding: UnderstandingResult,
  sourceText: string,
  options: {
    direction?: LayoutDirection;
    engine?: AnalysisEngine;
    inputKind?: InputKind;
    inputConfidence?: number;
    classification?: InputClassification;
    warnings?: string[];
    assumptions?: string[];
    notes?: string[];
  } = {},
): Promise<IntelligenceResult> {
  const direction = options.direction ?? understanding.diagram.direction ?? 'TB';
  const normalized = normalizeAiDiagram(understanding.diagram, direction);
  const classification = options.classification ?? classifyInput(sourceText);
  return finalizeIntelligence(normalized.diagram, {
    direction,
    sourceText,
    classification,
    engine: options.engine ?? 'local',
    inputKind: options.inputKind ?? 'screenshot',
    inputConfidence: options.inputConfidence ?? classification.confidence,
    objective: understanding.objective,
    problem: understanding.problem,
    outcome: understanding.outcome,
    category: understanding.category,
    actors: understanding.actors,
    systems: understanding.systems,
    inputs: understanding.inputs,
    outputs: understanding.outputs,
    assumptions: [...understanding.assumptions, ...(options.assumptions ?? [])],
    questions: understanding.questions,
    warnings: [...understanding.warnings, ...normalized.warnings, ...(options.warnings ?? [])],
    notes: [...understanding.notes, ...(options.notes ?? [])],
  });
}

/** Normalises an AI response through the same validation/refinement/repair pipeline. */export async function buildIntelligenceFromAi(
  ai: AiDiagram,
  options: IntelligenceOptions & { direction?: LayoutDirection } = {},
): Promise<IntelligenceResult> {
  const direction = options.direction ?? ai.direction ?? 'TB';
  const normalized = normalizeAiDiagram(ai, direction);
  const sourceText = options.sourceText ?? '';
  let understanding: UnderstandingResult | undefined;
  if (sourceText) {
    try {
      understanding = understandWorkflow(sourceText, direction);
    } catch {
      understanding = undefined;
    }
  }
  const meta = metadataFromText(sourceText, understanding);
  const classification = options.classification ?? classifyInput(sourceText);
  const engine = options.engine ?? 'hf';

  return finalizeIntelligence(normalized.diagram, {
    direction,
    sourceText,
    classification,
    engine,
    inputKind: options.inputKind ?? classification.kind,
    inputConfidence: options.inputConfidence ?? classification.confidence,
    objective: options.aiAnalysis?.objective ?? meta.objective,
    problem: options.aiAnalysis?.problem ?? meta.problem,
    outcome: options.aiAnalysis?.outcome ?? meta.outcome,
    category: options.aiAnalysis?.category ?? meta.category,
    actors: asStringArray(options.aiAnalysis?.actors).length
      ? asStringArray(options.aiAnalysis?.actors)
      : meta.actors,
    systems: asStringArray(options.aiAnalysis?.systems).length
      ? asStringArray(options.aiAnalysis?.systems)
      : meta.systems,
    inputs: asStringArray(options.aiAnalysis?.inputs).length
      ? asStringArray(options.aiAnalysis?.inputs)
      : meta.inputs,
    outputs: asStringArray(options.aiAnalysis?.outputs).length
      ? asStringArray(options.aiAnalysis?.outputs)
      : meta.outputs,
    assumptions: unique([
      'AI extracted the graph; structure was validated and repaired locally.',
      ...asStringArray(options.aiAnalysis?.assumptions),
      ...(options.assumptions ?? []),
    ]),
    questions: unique([
      ...asStringArray(options.aiAnalysis?.questions),
      ...(options.questions ?? []),
    ]),
    warnings: [
      ...normalized.warnings,
      ...asStringArray(options.aiAnalysis?.warnings),
      ...(options.warnings ?? []),
    ],
    notes: [...(understanding?.notes ?? []), ...(options.notes ?? [])],
    aiAnalysis: options.aiAnalysis,
  });
}
