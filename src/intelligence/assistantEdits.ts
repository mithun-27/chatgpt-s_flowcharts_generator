import type {
  FlowDiagram,
  FlowEdge,
  FlowNode,
  LayoutDirection,
  NodeColor,
  NodeShape,
} from '../types/diagram';
import { createFlowEdge, createFlowNode } from '../utils/diagram';
import { layoutDiagramBest } from '../editor/elkLayout';
import { addDecisionBranch, addErrorHandlingStep, simplifyDiagram } from '../utils/localEdits';
import { analyzeGraph } from './graphEngine';

export interface LocalEditResult {
  diagram: FlowDiagram;
  message: string;
  changed: boolean;
  /** Short human title shown in the preview header. */
  title: string;
}

interface DiagramGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  incoming: Map<string, FlowEdge[]>;
  outgoing: Map<string, FlowEdge[]>;
}

function describeEdge(edge: FlowEdge): string {
  return edge.label ? String(edge.label) : '';
}

function nodeColor(shape: NodeShape): NodeColor {
  switch (shape) {
    case 'decision':
      return 'amber';
    case 'document':
      return 'violet';
    case 'inputOutput':
      return 'blue';
    case 'startEnd':
      return 'green';
    case 'connector':
      return 'slate';
    default:
      return 'slate';
  }
}

function addNode(
  shape: NodeShape,
  label: string,
  color: NodeColor = nodeColor(shape),
  rationale?: string,
): FlowNode {
  const node = createFlowNode(shape, { x: 0, y: 0 }, label, color);
  node.data = {
    ...node.data,
    provenance: 'inferred',
    confidence: 0.6,
    ...(rationale ? { rationale } : {}),
  };
  return node;
}

function buildGraph(diagram: FlowDiagram): DiagramGraph {
  const incoming = new Map<string, FlowEdge[]>();
  const outgoing = new Map<string, FlowEdge[]>();
  for (const node of diagram.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of diagram.edges) {
    if (outgoing.has(edge.source)) outgoing.get(edge.source)!.push(edge);
    if (incoming.has(edge.target)) incoming.get(edge.target)!.push(edge);
  }
  return { nodes: diagram.nodes, edges: diagram.edges, incoming, outgoing };
}

function findStart(nodes: FlowNode[]): FlowNode | undefined {
  return (
    nodes.find(
      (node) =>
        node.data.shape === 'startEnd' && /^(?:start|begin|entry|trigger)\b/i.test(node.data.label),
    ) ?? nodes.find((node) => node.data.shape === 'startEnd')
  );
}

function findEnd(nodes: FlowNode[]): FlowNode | undefined {
  return (
    [...nodes]
      .reverse()
      .find(
        (node) =>
          node.data.shape === 'startEnd' &&
          /end|done|complete|finish|resolved|closed|exit/i.test(node.data.label),
      ) ?? [...nodes].reverse().find((node) => node.data.shape === 'startEnd')
  );
}

function containsEdge(edges: FlowEdge[], source: string, target: string): boolean {
  return edges.some((edge) => edge.source === source && edge.target === target);
}

/** Explains the graph from its actual structure, not from generic prose. */
export function explainDiagramLocally(diagram: FlowDiagram): string {
  if (diagram.nodes.length === 0) return 'The canvas is empty.';

  const graph = buildGraph(diagram);
  const start = findStart(diagram.nodes);
  const report = analyzeGraph(diagram);
  const decisions = diagram.nodes.filter((node) => node.data.shape === 'decision');
  const loops = report.cyclic
    ? report.cycleNodes
        .map((id) => diagram.nodes.find((node) => node.id === id)?.data.label)
        .filter((label): label is string => Boolean(label))
    : [];

  const lines: string[] = [];
  const objective = diagram.analysis?.objective;
  lines.push(
    objective
      ? `Objective: ${objective}`
      : `This diagram has ${diagram.nodes.length} steps and ${diagram.edges.length} connections.`,
  );
  if (diagram.analysis?.category) lines.push(`Category: ${diagram.analysis.category}.`);
  if (start) lines.push(`It begins at “${start.data.label}”.`);

  if (decisions.length > 0) {
    lines.push('Decision points:');
    for (const decision of decisions.slice(0, 8)) {
      const branches = (graph.outgoing.get(decision.id) ?? []).map((edge) => {
        const target = diagram.nodes.find((node) => node.id === edge.target);
        const label = describeEdge(edge);
        return `${label ? `${label} → ` : '→ '}“${target?.data.label ?? edge.target}”`;
      });
      lines.push(`- “${decision.data.label}” ${branches.join('; ') || '(no outgoing branch)'}`);
    }
  }

  if (loops.length > 0) {
    lines.push(`It contains a feedback loop through ${loops.map((label) => `“${label}”`).join(', ')}.`);
  }

  const ends = diagram.nodes.filter(
    (node) => node.data.shape === 'startEnd' && node.id !== start?.id,
  );
  if (ends.length > 0) {
    lines.push(`It finishes at ${ends.map((node) => `“${node.data.label}”`).join(', ')}.`);
  }

  if (report.unreachableNodes.length > 0) {
    lines.push(
      `Possible gaps: ${report.unreachableNodes.length} step${report.unreachableNodes.length === 1 ? '' : 's'} cannot be reached from Start.`,
    );
  }
  if (report.unlabeledBranches > 0) {
    lines.push(`${report.unlabeledBranches} branch${report.unlabeledBranches === 1 ? '' : 'es'} have no label.`);
  }
  return lines.join('\n');
}

export async function setDirectionEdit(
  diagram: FlowDiagram,
  direction: LayoutDirection,
): Promise<LocalEditResult> {
  const labels: Record<LayoutDirection, string> = {
    TB: 'top to bottom',
    LR: 'left to right',
    BT: 'bottom to top',
    RL: 'right to left',
  };
  return {
    diagram: await layoutDiagramBest(diagram, direction),
    message: `Re-laid out the flow ${labels[direction]}.`,
    changed: true,
    title: `Layout · ${labels[direction]}`,
  };
}

/**
 * Connects steps that have no incoming edge and dead ends that never reach End.
 * This only adds structural edges; it never invents business steps.
 */
export async function addMissingDependencies(
  diagram: FlowDiagram,
): Promise<LocalEditResult> {
  const graph = buildGraph(diagram);
  const start = findStart(diagram.nodes);
  const end = findEnd(diagram.nodes);
  const extraEdges: FlowEdge[] = [];
  let connectedEntries = 0;
  let connectedExits = 0;

  for (const node of diagram.nodes) {
    if (node.id === start?.id || node.id === end?.id) continue;
    const hasIncoming = (graph.incoming.get(node.id) ?? []).length > 0;
    if (!hasIncoming) {
      const source = start ?? graph.nodes.find((item) => (graph.outgoing.get(item.id) ?? []).length > 0);
      if (source && source.id !== node.id && !containsEdge(diagram.edges, source.id, node.id)) {
        extraEdges.push(createFlowEdge(source.id, node.id, 'Entry'));
        connectedEntries += 1;
      }
    }
  }

  for (const node of diagram.nodes) {
    if (node.data.shape === 'startEnd' || node.id === end?.id) continue;
    const hasOutgoing = (graph.outgoing.get(node.id) ?? []).length > 0;
    if (!hasOutgoing && end && end.id !== node.id) {
      if (!containsEdge(diagram.edges, node.id, end.id)) {
        extraEdges.push(createFlowEdge(node.id, end.id, 'Continue'));
        connectedExits += 1;
      }
    }
  }

  if (extraEdges.length === 0) {
    return {
      diagram,
      message: 'No missing dependencies or dead ends were found.',
      changed: false,
      title: 'Dependencies',
    };
  }

  const parts: string[] = [];
  if (connectedEntries > 0) parts.push(`connected ${connectedEntries} unlinked step${connectedEntries === 1 ? '' : 's'}`);
  if (connectedExits > 0) parts.push(`routed ${connectedExits} dead end${connectedExits === 1 ? '' : 's'} to the end`);

  return {
    diagram: await layoutDiagramBest({ ...diagram, edges: [...diagram.edges, ...extraEdges] }),
    message: `Repaired the graph: ${parts.join(' and ')}.`,
    changed: true,
    title: 'Missing dependencies',
  };
}

/** Splits a combined step such as "Validate input and check inventory" into two parallel steps. */
export async function addParallelExecution(
  diagram: FlowDiagram,
): Promise<LocalEditResult> {
  const graph = buildGraph(diagram);
  const candidates = diagram.nodes
    .filter(
      (node) =>
        (node.data.shape === 'process' || node.data.shape === 'inputOutput') &&
        /\s+(?:and|&)\s+/i.test(node.data.label),
    )
    .map((node) => ({
      node,
      parts: node.data.label
        .split(/\s+(?:and|&)\s+/i)
        .map((part) => part.trim().replace(/[.!?]+$/, ''))
        .filter((part) => part.split(' ').length >= 2),
    }))
    .filter((item) => item.parts.length >= 2)
    .sort(
      (left, right) =>
        (graph.incoming.get(right.node.id)?.length ?? 0) -
        (graph.incoming.get(left.node.id)?.length ?? 0),
    );

  const candidate = candidates[0];
  if (!candidate) {
    // Local understanding already splits “A and B” into separate steps, so the
    // combined-label case is often gone. Offer a genuine parallel track beside
    // the busiest working step instead of leaving the action as a dead end.
    const target = [...diagram.nodes]
      .filter(
        (node) => node.data.shape === 'process' || node.data.shape === 'inputOutput',
      )
      .map((node) => ({
        node,
        score:
          (graph.incoming.get(node.id)?.length ?? 0) +
          (graph.outgoing.get(node.id)?.length ?? 0),
      }))
      .sort((left, right) => right.score - left.score)[0]?.node;

    if (!target) {
      return {
        diagram,
        message: 'There is no working step to run in parallel yet.',
        changed: false,
        title: 'Parallel execution',
      };
    }

    const parallel = addNode(
      'process',
      `Parallel: ${target.data.label}`,
      'blue',
      `Runs alongside “${target.data.label}”. Rename it to describe the concurrent work.`,
    );
    const incoming = graph.incoming.get(target.id) ?? [];
    const outgoing = graph.outgoing.get(target.id) ?? [];
    const edges = [...diagram.edges];
    if (incoming.length > 0) {
      for (const edge of incoming) {
        if (!containsEdge(edges, edge.source, parallel.id)) {
          edges.push(createFlowEdge(edge.source, parallel.id, describeEdge(edge) || undefined));
        }
      }
    } else {
      const start = findStart(diagram.nodes);
      if (start) edges.push(createFlowEdge(start.id, parallel.id));
    }
    if (outgoing.length > 0) {
      for (const edge of outgoing) {
        if (!containsEdge(edges, parallel.id, edge.target)) {
          edges.push(createFlowEdge(parallel.id, edge.target, describeEdge(edge) || undefined));
        }
      }
    } else {
      const end = findEnd(diagram.nodes);
      if (end) edges.push(createFlowEdge(parallel.id, end.id, 'Complete'));
    }

    return {
      diagram: await layoutDiagramBest({
        ...diagram,
        nodes: [...diagram.nodes, parallel],
        edges,
      }),
      message: `Added a parallel track beside “${target.data.label}”. Rename the new step to describe the concurrent work.`,
      changed: true,
      title: 'Parallel execution',
    };
  }

  const { node, parts } = candidate;
  const incoming = graph.incoming.get(node.id) ?? [];
  const outgoing = graph.outgoing.get(node.id) ?? [];
  const created = parts.slice(0, 3).map((part) =>
    addNode('process', part, 'blue', `Parallel branch split from “${node.data.label}”.`),
  );

  const edges = diagram.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
  for (const edge of incoming) {
    for (const parallel of created) {
      edges.push(createFlowEdge(edge.source, parallel.id, describeEdge(edge) || undefined));
    }
  }
  for (const parallel of created) {
    for (const edge of outgoing) {
      edges.push(createFlowEdge(parallel.id, edge.target, describeEdge(edge) || undefined));
    }
  }
  if (incoming.length === 0) {
    const start = findStart(diagram.nodes);
    if (start) for (const parallel of created) edges.push(createFlowEdge(start.id, parallel.id));
  }
  if (outgoing.length === 0) {
    const end = findEnd(diagram.nodes);
    if (end) for (const parallel of created) edges.push(createFlowEdge(parallel.id, end.id, 'Complete'));
  }

  return {
    diagram: await layoutDiagramBest({
      ...diagram,
      nodes: [...diagram.nodes.filter((item) => item.id !== node.id), ...created],
      edges,
    }),
    message: `Split “${node.data.label}” into ${created.length} parallel branches.`,
    changed: true,
    title: 'Parallel execution',
  };
}

/** Adds one clearly marked refinement step after the busiest working step. */
export async function addDetailStep(diagram: FlowDiagram): Promise<LocalEditResult> {
  const graph = buildGraph(diagram);
  const candidates = diagram.nodes
    .filter((node) => node.data.shape !== 'startEnd' && node.data.shape !== 'connector')
    .map((node) => ({
      node,
      score:
        (graph.incoming.get(node.id)?.length ?? 0) +
        (graph.outgoing.get(node.id)?.length ?? 0) +
        (node.data.shape === 'decision' ? 1 : 0),
    }))
    .sort((left, right) => right.score - left.score);

  const target = candidates[0]?.node;
  if (!target) {
    return {
      diagram,
      message: 'There is no step to expand yet.',
      changed: false,
      title: 'Add detail',
    };
  }

  const detail = addNode(
    'process',
    `Detail: ${target.data.label}`,
    'slate',
    `Requested detail under “${target.data.label}”; rename this step to describe the actual work.`,
  );
  const outgoing = graph.outgoing.get(target.id) ?? [];
  const edges = diagram.edges.filter((edge) => edge.source !== target.id);
  edges.push(createFlowEdge(target.id, detail.id));
  for (const edge of outgoing) {
    edges.push(createFlowEdge(detail.id, edge.target, describeEdge(edge) || undefined));
  }
  if (outgoing.length === 0) {
    const end = findEnd(diagram.nodes);
    if (end && end.id !== detail.id) edges.push(createFlowEdge(detail.id, end.id));
  }

  return {
    diagram: await layoutDiagramBest({ ...diagram, nodes: [...diagram.nodes, detail], edges }),
    message: `Added a refinement step after “${target.data.label}”. Rename it to describe the detail you want.`,
    changed: true,
    title: 'Add detail',
  };
}

/** Gives each agent step a visible output artifact. */
export async function addAgentArchitecture(
  diagram: FlowDiagram,
): Promise<LocalEditResult> {
  const graph = buildGraph(diagram);
  const agents = diagram.nodes.filter(
    (node) =>
      node.data.shape === 'process' &&
      /\b(?:agent|assistant|worker|orchestrator|planner|researcher)\b/i.test(node.data.label),
  );
  if (agents.length === 0) {
    return {
      diagram,
      message:
        'No agent-like steps were found. Label the steps “Research Agent”, “Planning Agent”, and so on, or ask AI to design an agent architecture.',
      changed: false,
      title: 'Agent architecture',
    };
  }

  const target = agents[agents.length - 1];
  const output = addNode(
    'document',
    `${target.data.label} output`,
    'violet',
    `Output artifact for “${target.data.label}”.`,
  );
  const outgoing = graph.outgoing.get(target.id) ?? [];
  const edges = diagram.edges.filter((edge) => edge.source !== target.id);
  edges.push(createFlowEdge(target.id, output.id, 'Produces'));
  for (const edge of outgoing) {
    edges.push(createFlowEdge(output.id, edge.target, describeEdge(edge) || undefined));
  }
  if (outgoing.length === 0) {
    const end = findEnd(diagram.nodes);
    if (end) edges.push(createFlowEdge(output.id, end.id));
  }

  return {
    diagram: await layoutDiagramBest({ ...diagram, nodes: [...diagram.nodes, output], edges }),
    message: `Added an output artifact for “${target.data.label}”.`,
    changed: true,
    title: 'Agent architecture',
  };
}

/** Adds a genuine alternative route at the last decision, or a new decision before End. */
export async function addAlternativePath(diagram: FlowDiagram): Promise<LocalEditResult> {
  const graph = buildGraph(diagram);
  const decisions = [...diagram.nodes].reverse().filter((node) => node.data.shape === 'decision');
  const decision = decisions.find((node) =>
    (graph.outgoing.get(node.id) ?? []).every((edge) => !/no|else|otherwise|alternative/i.test(describeEdge(edge))),
  );

  if (decision) {
    const alternative = addNode(
      'process',
      'Alternative path',
      'amber',
      `Alternative branch requested for “${decision.data.label}”.`,
    );
    const edges = [
      ...diagram.edges,
      createFlowEdge(decision.id, alternative.id, 'No'),
    ];
    const end = findEnd(diagram.nodes);
    if (end) edges.push(createFlowEdge(alternative.id, end.id));
    return {
      diagram: await layoutDiagramBest({ ...diagram, nodes: [...diagram.nodes, alternative], edges }),
      message: `Added an alternative branch to “${decision.data.label}”.`,
      changed: true,
      title: 'Alternatives',
    };
  }

  const fallback = addDecisionBranch(diagram);
  return {
    diagram: fallback.diagram,
    message: fallback.message,
    changed: fallback.diagram !== diagram,
    title: 'Alternatives',
  };
}

export function addExceptionHandling(diagram: FlowDiagram): LocalEditResult {
  const result = addErrorHandlingStep(diagram);
  return {
    diagram: result.diagram,
    message: result.message,
    changed: result.diagram !== diagram,
    title: 'Exception handling',
  };
}

export function simplifyLocal(diagram: FlowDiagram): LocalEditResult {
  const result = simplifyDiagram(diagram);
  return {
    diagram: result.diagram,
    message: result.message,
    changed: result.diagram !== diagram,
    title: 'Simplify',
  };
}
