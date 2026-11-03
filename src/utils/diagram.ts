import type { Edge } from '@xyflow/react';
import type {
  AiDiagram,
  AiEdge,
  AiNode,
  FlowDiagram,
  FlowEdge,
  FlowNode,
  LayoutDirection,
  NodeColor,
  NodeShape,
  NormalizedDiagram,
} from '../types/diagram';
import { layoutDiagram } from '../editor/layout';
import { defaultColorForShape } from '../editor/nodeTheme';

const SHAPES: NodeShape[] = [
  'startEnd',
  'process',
  'decision',
  'inputOutput',
  'document',
  'connector',
];

const COLORS: NodeColor[] = ['slate', 'blue', 'green', 'amber', 'rose', 'violet'];

let counter = 0;

export function uid(prefix: 'n' | 'e' = 'n'): string {
  counter += 1;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}-${counter}`;
}

export function cleanLabel(value: unknown, fallback = 'Untitled step'): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')
    .slice(0, 180);
  return cleaned || fallback;
}

export function isNodeShape(value: unknown): value is NodeShape {
  return typeof value === 'string' && SHAPES.includes(value as NodeShape);
}

export function isNodeColor(value: unknown): value is NodeColor {
  return typeof value === 'string' && COLORS.includes(value as NodeColor);
}

export function createFlowNode(
  shape: NodeShape,
  position: { x: number; y: number },
  label = 'New step',
  color: NodeColor = defaultColorForShape(shape),
): FlowNode {
  return {
    id: uid('n'),
    type: 'flow',
    position,
    data: { label: cleanLabel(label, 'New step'), shape, color },
  };
}

export function createFlowEdge(
  source: string,
  target: string,
  label?: string,
): FlowEdge {
  const clean = label ? cleanLabel(label, '') : '';
  return {
    id: uid('e'),
    source,
    target,
    type: 'flow',
    ...(clean ? { label: clean } : {}),
  };
}

function normalizeShape(value: unknown): NodeShape {
  return isNodeShape(value) ? value : 'process';
}

function normalizeColor(value: unknown, shape: NodeShape): NodeColor {
  return isNodeColor(value) ? value : defaultColorForShape(shape);
}

/**
 * Converts provider-agnostic AI output into the internal diagram model.
 * Every AI result is treated as untrusted: ids, shapes, colors, labels and
 * edges are validated and capped before touching React Flow.
 */
export function normalizeAiDiagram(
  input: AiDiagram | null | undefined,
  fallbackDirection: LayoutDirection = 'TB',
): NormalizedDiagram {
  const warnings: string[] = [];
  if (!input || !Array.isArray(input.nodes) || input.nodes.length === 0) {
    throw new Error('The AI response did not contain any flowchart nodes.');
  }

  const sourceNodes = input.nodes.slice(0, 80);
  if (input.nodes.length > 80) {
    warnings.push('Only the first 80 nodes were kept.');
  }

  const idMap = new Map<string, string>();
  const nodes: FlowNode[] = [];

  sourceNodes.forEach((rawNode: AiNode, index) => {
    if (!rawNode || typeof rawNode !== 'object') return;
    const shape = normalizeShape(rawNode.shape);
    const label = cleanLabel(rawNode.label, `Step ${index + 1}`);
    const node: FlowNode = {
      id: `n${index + 1}`,
      type: 'flow',
      position: { x: 0, y: index * 110 },
      data: {
        label,
        shape,
        color: normalizeColor(rawNode.color, shape),
      },
    };
    nodes.push(node);
    const rawId = typeof rawNode.id === 'string' ? rawNode.id.trim() : '';
    if (rawId && !idMap.has(rawId)) idMap.set(rawId, node.id);
  });

  if (nodes.length === 0) {
    throw new Error('The AI response did not contain any valid flowchart nodes.');
  }

  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  const sourceEdges = Array.isArray(input.edges) ? input.edges.slice(0, 180) : [];
  if (Array.isArray(input.edges) && input.edges.length > 180) {
    warnings.push('Only the first 180 connections were kept.');
  }

  sourceEdges.forEach((rawEdge: AiEdge) => {
    if (!rawEdge || typeof rawEdge !== 'object') return;
    const source = idMap.get(String(rawEdge.source));
    const target = idMap.get(String(rawEdge.target));
    if (!source || !target) {
      warnings.push('A connection referenced a missing node and was skipped.');
      return;
    }
    if (source === target) return;
    const label = rawEdge.label ? cleanLabel(rawEdge.label, '') : '';
    const key = `${source}|${target}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: `e${edges.length + 1}`,
      source,
      target,
      type: 'flow',
      ...(label ? { label } : {}),
    });
  });

  const direction: LayoutDirection = input.direction === 'LR' ? 'LR' : fallbackDirection;
  const title =
    typeof input.title === 'string' ? cleanLabel(input.title, '').replace(/\n+/g, ' ') : '';
  const diagram = layoutDiagram(
    {
      version: 1,
      ...(title ? { title } : {}),
      direction,
      nodes,
      edges,
    },
    direction,
  );

  return { diagram, warnings };
}

export function cleanDiagram(diagram: FlowDiagram): FlowDiagram {
  return {
    version: 1,
    ...(diagram.title ? { title: diagram.title } : {}),
    direction: diagram.direction,
    nodes: diagram.nodes.map((node) => ({
      id: node.id,
      type: 'flow',
      position: { x: node.position.x, y: node.position.y },
      data: {
        label: node.data.label,
        shape: node.data.shape,
        color: node.data.color,
      },
    })),
    edges: diagram.edges.map((edge: Edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'flow',
      ...(edge.label ? { label: String(edge.label) } : {}),
    })),
  };
}

export function toExportJson(diagram: FlowDiagram): string {
  return JSON.stringify(cleanDiagram(diagram), null, 2);
}

export function countSelected(diagram: FlowDiagram): {
  nodes: number;
  edges: number;
} {
  return {
    nodes: diagram.nodes.filter((node) => node.selected).length,
    edges: diagram.edges.filter((edge) => edge.selected).length,
  };
}

export function diagramToSummary(diagram: FlowDiagram): string {
  const { nodes, edges } = diagram;
  if (nodes.length === 0) return 'The canvas is empty.';

  const start = nodes.find((node) => node.data.shape === 'startEnd');
  const decisions = nodes.filter((node) => node.data.shape === 'decision');
  const documents = nodes.filter((node) => node.data.shape === 'document');
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of edges) {
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  const terminal = nodes.filter((node) => (outgoing.get(node.id) ?? 0) === 0);
  const orphans = nodes.filter(
    (node) => (incoming.get(node.id) ?? 0) === 0 && (outgoing.get(node.id) ?? 0) === 0,
  );

  const lines = [
    `This flowchart contains ${nodes.length} node${nodes.length === 1 ? '' : 's'} and ${edges.length} connection${edges.length === 1 ? '' : 's'}.`,
    start ? `It begins at “${start.data.label}”.` : 'It does not have an explicit start node.',
    `The flow moves ${diagram.direction === 'LR' ? 'left to right' : 'top to bottom'}.`,
  ];

  if (decisions.length > 0) {
    lines.push(
      `Decision points: ${decisions.map((node) => `“${node.data.label}”`).join(', ')}.`,
    );
  }
  if (documents.length > 0) {
    lines.push(
      `Document steps: ${documents.map((node) => `“${node.data.label}”`).join(', ')}.`,
    );
  }
  if (terminal.length > 0) {
    lines.push(`Terminal steps: ${terminal.map((node) => `“${node.data.label}”`).join(', ')}.`);
  }
  if (orphans.length > 0) {
    lines.push(
      `Unconnected steps: ${orphans.map((node) => `“${node.data.label}”`).join(', ')}.`,
    );
  }

  const branches = edges.filter((edge) => edge.label);
  if (branches.length > 0) {
    lines.push(
      `Branch labels: ${branches.map((edge) => `“${String(edge.label)}”`).join(', ')}.`,
    );
  }

  return lines.join(' ');
}
