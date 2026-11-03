import type { Edge, Node } from '@xyflow/react';

export type NodeShape =
  | 'startEnd'
  | 'process'
  | 'decision'
  | 'inputOutput'
  | 'document'
  | 'connector';

export type NodeColor = 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';

export type LayoutDirection = 'TB' | 'LR';

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  shape: NodeShape;
  color: NodeColor;
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
}

/** Shape returned by AI services. Positions are intentionally omitted. */
export interface AiNode {
  id?: string;
  label: string;
  shape?: NodeShape;
  color?: NodeColor;
}

export interface AiEdge {
  source: string;
  target: string;
  label?: string;
}

export interface AiDiagram {
  title?: string;
  direction?: LayoutDirection;
  nodes: AiNode[];
  edges?: AiEdge[];
}

export interface NormalizedDiagram {
  diagram: FlowDiagram;
  warnings: string[];
}
