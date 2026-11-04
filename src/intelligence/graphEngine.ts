import type { FlowDiagram, FlowEdge, FlowNode, QualityReport } from '../types/diagram';
import { normalizeLabelForCompare } from './nlp';

export interface GraphReport extends QualityReport {
  topologicalOrder: string[];
  entries: string[];
  exits: string[];
  components: string[][];
}

interface Adjacency {
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

function buildAdjacency(nodes: FlowNode[], edges: FlowEdge[]): Adjacency {
  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of nodes) {
    out.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of edges) {
    if (!out.has(edge.source) || !out.has(edge.target)) continue;
    out.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }
  return { out, in: incoming };
}

function tarjanScc(nodes: FlowNode[], adjacency: Adjacency): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];

  const visit = (id: string) => {
    indices.set(id, index);
    low.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);

    for (const next of adjacency.out.get(id) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id)!, indices.get(next)!));
      }
    }

    if (low.get(id) === indices.get(id)) {
      const component: string[] = [];
      let member = '';
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      result.push(component);
    }
  };

  for (const node of nodes) {
    if (!indices.has(node.id)) visit(node.id);
  }
  return result;
}

function weakComponents(nodes: FlowNode[], edges: FlowEdge[]): string[][] {
  const parent = new Map<string, string>();
  for (const node of nodes) parent.set(node.id, node.id);

  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, parent.get(next)!);
      current = next;
    }
    return current;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) union(edge.source, edge.target);
  }

  const groups = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node.id);
    const group = groups.get(root) ?? [];
    group.push(node.id);
    groups.set(root, group);
  }
  return [...groups.values()];
}

function topologicalOrder(nodes: FlowNode[], adjacency: Adjacency): string[] {
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node.id, (adjacency.in.get(node.id) ?? []).length);
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.out.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  // Nodes on cycles cannot be ordered; append them once so layout/reporting
  // still sees every node.
  const seen = new Set(order);
  for (const node of nodes) {
    if (!seen.has(node.id)) order.push(node.id);
  }
  return order;
}

function reachableFrom(entries: string[], adjacency: Adjacency): Set<string> {
  const visited = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of adjacency.out.get(id) ?? []) queue.push(next);
  }
  return visited;
}

function duplicateNodeIds(nodes: FlowNode[]): string[] {
  const groups = new Map<string, FlowNode[]>();
  for (const node of nodes) {
    const key = normalizeLabelForCompare(node.data.label);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }
  const duplicates: string[] = [];
  for (const group of groups.values()) {
    if (group.length > 1) {
      for (const node of group.slice(1)) duplicates.push(node.id);
    }
  }
  return duplicates;
}

function branchLabelFor(node: FlowNode | undefined): string {
  if (!node) return 'No';
  if (/\b(?:retry|again|fail|failure|error|reject|rejected|cancel|invalid|decline|deny|abort)\b/i.test(node.data.label)) {
    return 'No';
  }
  if (/\b(?:end|done|complete|finish|stop|exit)\b/i.test(node.data.label)) return 'No';
  return 'Yes';
}

export function analyzeGraph(diagram: FlowDiagram): GraphReport {
  const nodes = diagram.nodes;
  const edges = diagram.edges;
  const adjacency = buildAdjacency(nodes, edges);
  const warnings: string[] = [];

  const components = weakComponents(nodes, edges);
  const sccs = tarjanScc(nodes, adjacency);
  const cycleGroups = sccs.filter(
    (group) =>
      group.length > 1 || (group.length === 1 && (adjacency.out.get(group[0]) ?? []).includes(group[0])),
  );
  const cycleNodes = [...new Set(cycleGroups.flat())];

  const entries = nodes
    .filter((node) => (adjacency.in.get(node.id) ?? []).length === 0)
    .map((node) => node.id);
  const exits = nodes
    .filter((node) => (adjacency.out.get(node.id) ?? []).length === 0)
    .map((node) => node.id);
  const reachable = reachableFrom(entries.length > 0 ? entries : nodes.slice(0, 1).map((node) => node.id), adjacency);
  const unreachableNodes = nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id);

  const decisions = nodes.filter((node) => node.data.shape === 'decision');
  let unlabeledBranches = 0;
  for (const decision of decisions) {
    const outgoing = edges.filter((edge) => edge.source === decision.id);
    if (outgoing.length >= 2) {
      const unlabeled = outgoing.filter((edge) => !edge.label).length;
      unlabeledBranches += unlabeled > 0 ? 1 : 0;
    } else {
      warnings.push(`Decision “${decision.data.label}” has fewer than two outgoing branches.`);
    }
  }

  const duplicateNodes = duplicateNodeIds(nodes);
  if (duplicateNodes.length > 0) warnings.push(`${duplicateNodes.length} duplicate node label(s) detected.`);
  if (unreachableNodes.length > 0) warnings.push(`${unreachableNodes.length} node(s) cannot be reached from an entry point.`);
  if (components.length > 1) warnings.push(`The diagram has ${components.length} disconnected sections.`);
  if (entries.length === 0) warnings.push('No clear entry point was found (every node has an incoming edge).');
  if (exits.length === 0) warnings.push('No clear exit point was found (every node has an outgoing edge).');
  if (cycleGroups.length > 0 && cycleNodes.length > 0) {
    warnings.push(`${cycleGroups.length} intentional cycle/feedback loop(s) preserved.`);
  }

  let score = 100;
  score -= Math.min(24, unreachableNodes.length * 8);
  score -= Math.min(20, duplicateNodes.length * 10);
  score -= Math.min(18, unlabeledBranches * 6);
  score -= Math.max(0, components.length - 1) * 10;
  score -= decisions.filter((node) => edges.filter((edge) => edge.source === node.id).length < 2).length * 8;
  score -= entries.length === 0 ? 10 : 0;
  score -= exits.length === 0 ? 5 : 0;
  score -= edges.filter((edge) => !adjacency.out.has(edge.source) || !adjacency.in.has(edge.target)).length * 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    decisionCount: decisions.length,
    cyclic: cycleGroups.length > 0,
    cycleCount: cycleGroups.length,
    cycleNodes,
    disconnectedComponents: components.length,
    unreachableNodes,
    duplicateNodes,
    unlabeledBranches,
    warnings,
    topologicalOrder: topologicalOrder(nodes, adjacency),
    entries,
    exits,
    components,
  };
}

function rewireDuplicates(diagram: FlowDiagram): { diagram: FlowDiagram; warnings: string[] } {
  const warnings: string[] = [];
  const byKey = new Map<string, FlowNode[]>();
  for (const node of diagram.nodes) {
    const key = normalizeLabelForCompare(node.data.label);
    if (!key) continue;
    const group = byKey.get(key) ?? [];
    group.push(node);
    byKey.set(key, group);
  }

  const replacements = new Map<string, string>();
  const removed = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (const candidate of group.slice(1)) {
      const source = group[0];
      const sameOutgoing =
        JSON.stringify(
          diagram.edges.filter((edge) => edge.source === candidate.id).map((edge) => edge.target).sort(),
        ) ===
        JSON.stringify(
          diagram.edges.filter((edge) => edge.source === source.id).map((edge) => edge.target).sort(),
        );
      // Only collapse genuine duplicates (same label and same outgoing shape).
      // Repeated "Retry" steps at different points remain distinct.
      if (sameOutgoing) {
        replacements.set(candidate.id, source.id);
        removed.add(candidate.id);
        warnings.push(`Merged duplicate step “${candidate.data.label}”.`);
      }
    }
  }

  if (removed.size === 0) return { diagram, warnings };

  const nodes = diagram.nodes.filter((node) => !removed.has(node.id));
  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  for (const edge of diagram.edges) {
    const source = replacements.get(edge.source) ?? edge.source;
    const target = replacements.get(edge.target) ?? edge.target;
    if (source === target) continue;
    const key = `${source}|${target}|${edge.label ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ ...edge, source, target });
  }

  return { diagram: { ...diagram, nodes, edges }, warnings };
}

function labelDecisionBranches(diagram: FlowDiagram): { diagram: FlowDiagram; warnings: string[] } {
  const warnings: string[] = [];
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const edges = diagram.edges.map((edge) => {
    const source = nodeById.get(edge.source);
    if (!source || source.data.shape !== 'decision' || edge.label) return edge;
    const outgoing = diagram.edges.filter((item) => item.source === edge.source);
    if (outgoing.length !== 2) return edge;
    const label = branchLabelFor(nodeById.get(edge.target));
    warnings.push(`Inferred “${label}” on a branch of “${source.data.label}”.`);
    return { ...edge, label };
  });
  return { diagram: { ...diagram, edges }, warnings };
}

function joinOrphanEnd(diagram: FlowDiagram): { diagram: FlowDiagram; warnings: string[] } {
  const report = analyzeGraph(diagram);
  if (report.components.length < 2) return { diagram, warnings: [] };

  const main = [...report.components].sort((a, b) => b.length - a.length)[0] ?? [];
  const mainSet = new Set(main);
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const orphanEnds = report.components
    .filter((component) => component.length === 1 && !mainSet.has(component[0]))
    .flatMap((component) => component)
    .filter((id) => {
      const node = nodeById.get(id);
      return Boolean(node && node.data.shape === 'startEnd' && /\b(end|done|complete|finish|exit|stop)\b/i.test(node.data.label));
    });

  if (orphanEnds.length !== 1) return { diagram, warnings: [] };

  const outgoing = new Set(diagram.edges.map((edge) => edge.source));
  const terminals = report.components
    .filter((component) => component.some((id) => mainSet.has(id)))
    .flatMap((component) => component)
    .filter((id) => mainSet.has(id) && !outgoing.has(id));
  if (terminals.length !== 1) return { diagram, warnings: [] };

  const edge: FlowEdge = {
    id: `e-join-${Date.now().toString(36)}`,
    source: terminals[0],
    target: orphanEnds[0],
    type: 'flow',
  };
  return {
    diagram: { ...diagram, edges: [...diagram.edges, edge] },
    warnings: [`Connected the orphan “${nodeById.get(orphanEnds[0])?.data.label}” step to the main flow.`],
  };
}

/**
 * Bounded self-check/repair. It never invents business steps; it only fixes
 * structural issues that can be corrected safely (dangling edges, duplicate
 * nodes, missing Yes/No labels, orphan end nodes).
 */
export function repairDiagram(diagram: FlowDiagram, attempts = 3): {
  diagram: FlowDiagram;
  warnings: string[];
  report: GraphReport;
} {
  const warnings: string[] = [];
  let current = diagram;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const nodeIds = new Set(current.nodes.map((node) => node.id));
    const edges = current.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target,
    );
    const dedupedEdges: FlowEdge[] = [];
    const seen = new Set<string>();
    for (const edge of edges) {
      const key = `${edge.source}|${edge.target}|${edge.label ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedEdges.push(edge);
    }
    let changed = dedupedEdges.length !== current.edges.length;
    current = { ...current, edges: dedupedEdges };

    const duplicate = rewireDuplicates(current);
    current = duplicate.diagram;
    warnings.push(...duplicate.warnings);
    changed = changed || duplicate.warnings.length > 0;

    const labeled = labelDecisionBranches(current);
    current = labeled.diagram;
    warnings.push(...labeled.warnings);
    changed = changed || labeled.warnings.length > 0;

    const joined = joinOrphanEnd(current);
    current = joined.diagram;
    warnings.push(...joined.warnings);
    changed = changed || joined.warnings.length > 0;

    if (!changed) break;
  }

  return { diagram: current, warnings: [...new Set(warnings)], report: analyzeGraph(current) };
}
