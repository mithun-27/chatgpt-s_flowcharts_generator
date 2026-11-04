import dagre from '@dagrejs/dagre';
import type { FlowDiagram, LayoutDirection } from '../types/diagram';
import { NODE_SIZES } from './nodeTheme';

/**
 * Re-arranges every node with Dagre. Node positions from imports are ignored,
 * which is what makes reconstructed diagrams look tidy immediately.
 */
export function layoutDiagram(
  diagram: FlowDiagram,
  direction: LayoutDirection = diagram.direction,
): FlowDiagram {
  if (diagram.nodes.length === 0) {
    return { ...diagram, direction };
  }

  const horizontal = direction === 'LR' || direction === 'RL';
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction,
    nodesep: horizontal ? 56 : 64,
    ranksep: horizontal ? 86 : 74,
    marginx: 32,
    marginy: 32,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of diagram.nodes) {
    const size = NODE_SIZES[node.data.shape] ?? NODE_SIZES.process;
    graph.setNode(node.id, { width: size.width, height: size.height });
  }

  const seen = new Set<string>();
  for (const edge of diagram.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const nodes = diagram.nodes.map((node) => {
    const size = NODE_SIZES[node.data.shape] ?? NODE_SIZES.process;
    const point = graph.node(node.id) as { x: number; y: number } | undefined;
    return {
      ...node,
      position: {
        x: (point?.x ?? 0) - size.width / 2,
        y: (point?.y ?? 0) - size.height / 2,
      },
    };
  });

  return { ...diagram, direction, nodes };
}
