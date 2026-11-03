import type { FlowDiagram, LayoutDirection, NodeShape } from '../types/diagram';
import { createFlowEdge, createFlowNode } from './diagram';
import { layoutDiagram } from '../editor/layout';

export function setDiagramDirection(
  diagram: FlowDiagram,
  direction: LayoutDirection,
): FlowDiagram {
  return layoutDiagram(diagram, direction);
}

export function addErrorHandlingStep(diagram: FlowDiagram): {
  diagram: FlowDiagram;
  message: string;
} {
  if (diagram.nodes.some((node) => /error|exception|failure/i.test(node.data.label))) {
    return { diagram, message: 'An error-handling step already exists.' };
  }

  const errorNode = createFlowNode(
    'process',
    { x: 0, y: 0 },
    'Handle error',
    'rose',
  );
  const endNode = diagram.nodes.find((node) => node.data.shape === 'startEnd' && /end|done|complete|resolved/i.test(node.data.label));
  const decision = [...diagram.nodes]
    .reverse()
    .find((node) => node.data.shape === 'decision');
  const anchor =
    decision ??
    [...diagram.nodes].reverse().find((node) => node.id !== endNode?.id) ??
    diagram.nodes[0];

  const nodes = [...diagram.nodes, errorNode];
  const edges = [...diagram.edges];

  if (anchor) {
    edges.push(createFlowEdge(anchor.id, errorNode.id, decision ? 'Error' : 'On failure'));
  }
  if (endNode && endNode.id !== anchor?.id) {
    edges.push(createFlowEdge(errorNode.id, endNode.id));
  }

  return {
    diagram: layoutDiagram({ ...diagram, nodes, edges }),
    message: 'Added an error-handling step.',
  };
}

export function addDecisionBranch(diagram: FlowDiagram): {
  diagram: FlowDiagram;
  message: string;
} {
  const decision = createFlowNode('decision', { x: 0, y: 0 }, 'New decision?', 'amber');
  const alternative = createFlowNode(
    'process',
    { x: 0, y: 0 },
    'Alternative path',
    'amber',
  );
  const endNode = diagram.nodes.find(
    (node) =>
      node.data.shape === 'startEnd' &&
      /end|done|complete|resolved/i.test(node.data.label),
  );

  const nodes = [...diagram.nodes, decision, alternative];
  let edges = [...diagram.edges];

  if (endNode) {
    const incoming = edges.filter((edge) => edge.target === endNode.id);
    edges = edges.filter((edge) => edge.target !== endNode.id);
    if (incoming.length > 0) {
      for (const edge of incoming) {
        edges.push(createFlowEdge(edge.source, decision.id, edge.label ? String(edge.label) : undefined));
      }
    } else {
      const previous = [...diagram.nodes]
        .reverse()
        .find((node) => node.id !== endNode.id);
      if (previous) edges.push(createFlowEdge(previous.id, decision.id));
    }
    edges.push(createFlowEdge(decision.id, endNode.id, 'Yes'));
    edges.push(createFlowEdge(decision.id, alternative.id, 'No'));
    edges.push(createFlowEdge(alternative.id, endNode.id));
  } else {
    const previous = [...diagram.nodes].reverse().find(Boolean);
    if (previous) edges.push(createFlowEdge(previous.id, decision.id));
    edges.push(createFlowEdge(decision.id, alternative.id, 'No'));
  }

  return {
    diagram: layoutDiagram({ ...diagram, nodes, edges }),
    message: 'Added a new decision branch.',
  };
}

export function simplifyDiagram(diagram: FlowDiagram): {
  diagram: FlowDiagram;
  message: string;
} {
  const removable = new Set(
    diagram.nodes
      .filter((node) => node.data.shape === 'document' || node.data.shape === 'connector')
      .map((node) => node.id),
  );

  if (removable.size === 0) {
    return {
      diagram,
      message: 'No document or connector steps to remove. Try an AI instruction for deeper edits.',
    };
  }

  const keptNodes = diagram.nodes.filter((node) => !removable.has(node.id));
  const remainingEdges = diagram.edges.filter(
    (edge) => !removable.has(edge.source) && !removable.has(edge.target),
  );
  const edges = [...remainingEdges];

  for (const nodeId of removable) {
    const incoming = diagram.edges.filter((edge) => edge.target === nodeId);
    const outgoing = diagram.edges.filter((edge) => edge.source === nodeId);
    for (const before of incoming) {
      for (const after of outgoing) {
        if (before.source === after.target) continue;
        edges.push(
          createFlowEdge(
            before.source,
            after.target,
            after.label ? String(after.label) : before.label ? String(before.label) : undefined,
          ),
        );
      }
    }
  }

  return {
    diagram: layoutDiagram({ ...diagram, nodes: keptNodes, edges }),
    message: `Removed ${removable.size} document/connector step${removable.size === 1 ? '' : 's'}.`,
  };
}

export function addNodeToDiagram(
  diagram: FlowDiagram,
  shape: NodeShape,
  position: { x: number; y: number },
): FlowDiagram {
  const node = createFlowNode(shape, position);
  return { ...diagram, nodes: [...diagram.nodes, node] };
}
