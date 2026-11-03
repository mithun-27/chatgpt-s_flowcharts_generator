import type { NodeColor, NodeShape } from '../types/diagram';

export const NODE_SIZES: Record<NodeShape, { width: number; height: number }> = {
  startEnd: { width: 164, height: 60 },
  process: { width: 194, height: 76 },
  decision: { width: 176, height: 124 },
  inputOutput: { width: 204, height: 76 },
  document: { width: 200, height: 92 },
  connector: { width: 112, height: 112 },
};

export const NODE_COLORS: Record<
  NodeColor,
  { label: string; fill: string; border: string; text: string; swatch: string }
> = {
  slate: {
    label: 'Slate',
    fill: '#f1f5f9',
    border: '#94a3b8',
    text: '#0f172a',
    swatch: '#94a3b8',
  },
  blue: {
    label: 'Blue',
    fill: '#e0f2fe',
    border: '#38bdf8',
    text: '#0c4a6e',
    swatch: '#38bdf8',
  },
  green: {
    label: 'Green',
    fill: '#dcfce7',
    border: '#4ade80',
    text: '#14532d',
    swatch: '#4ade80',
  },
  amber: {
    label: 'Amber',
    fill: '#fef3c7',
    border: '#fbbf24',
    text: '#78350f',
    swatch: '#fbbf24',
  },
  rose: {
    label: 'Rose',
    fill: '#ffe4e6',
    border: '#fb7185',
    text: '#881337',
    swatch: '#fb7185',
  },
  violet: {
    label: 'Violet',
    fill: '#ede9fe',
    border: '#a78bfa',
    text: '#4c1d95',
    swatch: '#a78bfa',
  },
};

export const COLOR_ORDER: NodeColor[] = ['slate', 'blue', 'green', 'amber', 'rose', 'violet'];

export const SHAPE_LABELS: Record<NodeShape, string> = {
  startEnd: 'Start / End',
  process: 'Process',
  decision: 'Decision',
  inputOutput: 'Input / Output',
  document: 'Document',
  connector: 'Connector',
};

export const SHAPE_ORDER: NodeShape[] = [
  'startEnd',
  'process',
  'decision',
  'inputOutput',
  'document',
  'connector',
];

export function defaultColorForShape(shape: NodeShape): NodeColor {
  switch (shape) {
    case 'startEnd':
      return 'green';
    case 'decision':
      return 'amber';
    case 'inputOutput':
      return 'blue';
    case 'document':
      return 'violet';
    case 'connector':
      return 'slate';
    default:
      return 'slate';
  }
}
