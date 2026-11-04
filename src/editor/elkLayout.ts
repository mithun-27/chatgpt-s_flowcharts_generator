import type { ElkNode } from 'elkjs/lib/elk-api';
import type { FlowDiagram, LayoutDirection } from '../types/diagram';
import { NODE_SIZES } from './nodeTheme';
import { layoutDiagram } from './layout';

const ELK_DIRECTION: Record<LayoutDirection, string> = {
  TB: 'DOWN',
  LR: 'RIGHT',
  BT: 'UP',
  RL: 'LEFT',
};

/**
 * Preferred layout engine. ELK's layered algorithm handles branches, merges,
 * parallel paths and cycles, and computes every coordinate from the graph.
 * The large engine is loaded on demand; Dagre remains the instant fallback.
 */
export async function layoutDiagramWithElk(
  diagram: FlowDiagram,
  direction: LayoutDirection = diagram.direction,
): Promise<FlowDiagram> {
  if (diagram.nodes.length === 0) {
    return { ...diagram, direction };
  }

  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[direction],
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': direction === 'TB' || direction === 'BT' ? '62' : '52',
      'elk.layered.spacing.nodeNodeBetweenLayers':
        direction === 'TB' || direction === 'BT' ? '78' : '88',
      'elk.layered.spacing.edgeNodeBetweenLayers': '28',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.padding': '[top=36,left=36,bottom=36,right=36]',
    },
    children: diagram.nodes.map((node) => {
      const size = NODE_SIZES[node.data.shape] ?? NODE_SIZES.process;
      return {
        id: node.id,
        width: size.width,
        height: size.height,
      };
    }),
    edges: diagram.edges
      .filter((edge) => diagram.nodes.some((node) => node.id === edge.source) && diagram.nodes.some((node) => node.id === edge.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  };

  const result = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  const nodes = diagram.nodes.map((node) => {
    const point = positions.get(node.id);
    return point
      ? { ...node, position: { x: point.x, y: point.y } }
      : node;
  });

  return { ...diagram, direction, nodes };
}

/**
 * Tries ELK, then falls back to Dagre. Never throws because layout must not
 * block a usable diagram.
 */
export async function layoutDiagramBest(
  diagram: FlowDiagram,
  direction: LayoutDirection = diagram.direction,
): Promise<FlowDiagram> {
  try {
    return await layoutDiagramWithElk(diagram, direction);
  } catch {
    return layoutDiagram(diagram, direction);
  }
}
