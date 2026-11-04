import type { Edge, Node } from '@xyflow/react';

export type NodeShape =
  | 'startEnd'
  | 'process'
  | 'decision'
  | 'inputOutput'
  | 'document'
  | 'connector';

export type NodeColor = 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

export type InputKind =
  | 'natural-language'
  | 'chatgpt-response'
  | 'ascii'
  | 'screenshot'
  | 'mermaid'
  | 'numbered-steps'
  | 'technical-doc'
  | 'agent-workflow'
  | 'architecture'
  | 'business-process';

/** Whether a step came from the source text or was inferred by the pipeline. */
export type Provenance = 'explicit' | 'inferred';

export interface QualityReport {
  /** Graph quality from 0 to 100 (not a 0–1 fraction). */
  score: number;
  nodeCount: number;
  edgeCount: number;
  decisionCount: number;
  cyclic: boolean;
  cycleCount: number;
  cycleNodes: string[];
  disconnectedComponents: number;
  unreachableNodes: string[];
  duplicateNodes: string[];
  unlabeledBranches: number;
  warnings: string[];
}

export interface DiagramAnalysis {
  inputKind: InputKind;
  inputConfidence: number;
  objective?: string;
  problem?: string;
  category?: string;
  actors: string[];
  systems: string[];
  inputs: string[];
  outputs: string[];
  outcome?: string;
  assumptions: string[];
  questions: string[];
  warnings: string[];
  engine: 'local' | 'hybrid' | 'hf' | 'openai-compatible';
  quality?: QualityReport;
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  shape: NodeShape;
  color: NodeColor;
  confidence?: number;
  provenance?: Provenance;
  rationale?: string;
}

export type FlowNode = Node<FlowNodeData, 'flow'>;
export type FlowEdge = Edge;

export interface FlowDiagram {
  version: 1;
  /** Optional title extracted from the pasted workflow. */
  title?: string;
  direction: LayoutDirection;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Optional understanding/quality metadata for the UI and JSON export. */
  analysis?: DiagramAnalysis;
}

/** Shape returned by AI services. Positions are intentionally omitted. */
export interface AiNode {
  id?: string;
  label: string;
  shape?: NodeShape;
  color?: NodeColor;
  confidence?: number;
  provenance?: Provenance;
  rationale?: string;
}

export interface AiEdge {
  source: string;
  target: string;
  label?: string;
  provenance?: Provenance;
}

export interface AiDiagram {
  title?: string;
  direction?: LayoutDirection;
  nodes: AiNode[];
  edges?: AiEdge[];
  analysis?: Partial<DiagramAnalysis>;
}

export interface NormalizedDiagram {
  diagram: FlowDiagram;
  warnings: string[];
}
