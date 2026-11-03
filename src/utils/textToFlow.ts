import type { AiDiagram, AiEdge, AiNode, FlowDiagram, NodeShape } from '../types/diagram';
import { normalizeAiDiagram } from './diagram';

function stripMarkdown(value: string): string {
  return value.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
}

function cleanLine(raw: string): string {
  return raw
    .replace(/^\s*(?:[-*•]|\d+[.)]|step\s*\d+\s*[:.)-]?)\s*/i, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*(?:then|next)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/, '')
    .trim();
}

function detectShape(label: string): NodeShape {
  const value = label.trim();
  if (/^(end|finish|done|complete|completed|closed|resolve|resolved)\b/i.test(value)) {
    return 'startEnd';
  }
  if (/^(start|begin|kick off|trigger)\b/i.test(value)) {
    return 'startEnd';
  }
  if (
    /^(if|when|whether|is|are|does|do|can|has|have|should|check whether)\b/i.test(value) ||
    value.endsWith('?')
  ) {
    return 'decision';
  }
  if (
    /^(enter|input|upload|read|receive|get|collect|select|choose|send|show|display|output|print|notify|email|return|provide)\b/i.test(
      value,
    )
  ) {
    return 'inputOutput';
  }
  if (/\b(document|report|invoice|receipt|log|record|letter|contract|form|archive)\b/i.test(value)) {
    return 'document';
  }
  if (/\b(connector|go to|jump to|continue at|loop back)\b/i.test(value)) {
    return 'connector';
  }
  return 'process';
}

function splitIntoLines(text: string): string[] {
  const prepared = stripMarkdown(text);
  let lines = prepared
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  if (lines.length <= 1) {
    lines = prepared
      .split(/(?:[.;]|\bthen\b|\n)\s+/i)
      .map(cleanLine)
      .filter(Boolean);
  }

  return lines;
}

function decisionLabel(value: string): string {
  let label = value.replace(/^(if|when|whether)\s+/i, '').trim();
  label = label.replace(/[?]+$/, '');
  if (!label) return 'Decision?';
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}?`;
}

/**
 * Rule-based parser used by the demo mode and the "simple parser" action.
 * It intentionally handles common workflow phrasing, not every possible
 * natural-language construction. AI mode is available for harder text.
 */
export function textToDiagram(text: string): FlowDiagram {
  const lines = splitIntoLines(text);
  if (lines.length === 0) {
    throw new Error('Paste a workflow description with at least one step.');
  }

  const nodes: AiNode[] = [];
  const edges: AiEdge[] = [];
  let previous: string | null = null;
  let lastDecision: string | null = null;

  const addNode = (label: string, shape: NodeShape): string => {
    const id = `local-${nodes.length + 1}`;
    nodes.push({ id, label, shape });
    return id;
  };

  const addEdge = (source: string, target: string, label?: string) => {
    if (source === target) return;
    const duplicate = edges.some(
      (edge) =>
        edge.source === source &&
        edge.target === target &&
        (edge.label ?? '') === (label ?? ''),
    );
    if (!duplicate) edges.push({ source, target, label });
  };

  for (const line of lines) {
    const branchMatch = line.match(/^(yes|no)\b\s*[:,-]?\s*(.*)$/i);
    if (branchMatch && lastDecision) {
      const which = branchMatch[1].toLowerCase() as 'yes' | 'no';
      const label = branchMatch[2] || (which === 'yes' ? 'Continue' : 'Stop');
      const id = addNode(label, detectShape(label));
      addEdge(lastDecision, id, which === 'yes' ? 'Yes' : 'No');
      previous = id;
      continue;
    }

    if (/^(otherwise|else)\b\s*[,:]?\s*/i.test(line) && lastDecision) {
      const label = line.replace(/^(otherwise|else)\b\s*[,:]?\s*/i, '');
      const id = addNode(label || 'Alternative path', detectShape(label));
      addEdge(lastDecision, id, 'No');
      previous = id;
      continue;
    }

    const shape = detectShape(line);
    let label = line;

    if (/^(if|when)\b/i.test(line)) {
      const inline = line.match(
        /^(?:if|when)\s+(.+?)(?:,|\s+then\s+)\s*(.+?)(?:\s*(?:else|otherwise)\s*[,:]?\s*(.+))?$/i,
      );
      if (inline) {
        const decisionId = addNode(decisionLabel(inline[1]), 'decision');
        if (previous) addEdge(previous, decisionId);
        else {
          const startId = addNode('Start', 'startEnd');
          addEdge(startId, decisionId);
        }
        const yesId = addNode(inline[2] || 'Continue', detectShape(inline[2] || ''));
        addEdge(decisionId, yesId, 'Yes');

        if (inline[3]) {
          const noId = addNode(inline[3], detectShape(inline[3]));
          addEdge(decisionId, noId, 'No');
        }

        previous = yesId;
        lastDecision = decisionId;
        continue;
      }
      label = decisionLabel(line);
    }

    const finalShape = label === line ? shape : 'decision';
    const id = addNode(
      label.charAt(0).toUpperCase() + label.slice(1),
      finalShape,
    );

    if (previous) {
      const previousNode = nodes.find((node) => node.id === previous);
      addEdge(
        previous,
        id,
        previousNode?.shape === 'decision' && finalShape !== 'decision' ? 'Yes' : undefined,
      );
    }
    previous = id;
    if (finalShape === 'decision') lastDecision = id;
  }

  if (nodes.length === 0) {
    throw new Error('Could not find any steps in that text.');
  }

  const first = nodes[0];
  const firstId = first.id;
  if (first.shape !== 'startEnd' && firstId) {
    const startId = 'local-start';
    nodes.unshift({ id: startId, label: 'Start', shape: 'startEnd' });
    edges.unshift({ source: startId, target: firstId });
  }

  const last = nodes[nodes.length - 1];
  const looksLikeEnd = last.shape === 'startEnd';
  let endId: string | null = null;
  if (!looksLikeEnd) {
    endId = 'local-end';
    nodes.push({ id: endId, label: 'Done', shape: 'startEnd' });
  } else {
    endId = last.id ?? null;
  }

  // Converge dangling branches into the terminal node.
  if (endId) {
    const outgoing = new Set(edges.map((edge) => edge.source));
    for (const node of nodes) {
      if (!node.id || node.id === endId) continue;
      if (!outgoing.has(node.id)) {
        addEdge(node.id, endId, node.shape === 'decision' ? 'No' : undefined);
      }
    }

    if (lastDecision) {
      const decision = nodes.find((node) => node.id === lastDecision);
      if (decision) {
        const hasNo = edges.some(
          (edge) => edge.source === lastDecision && edge.label === 'No',
        );
        if (!hasNo && !outgoing.has(lastDecision)) {
          addEdge(lastDecision, endId, 'No');
        }
      }
    }
  }

  const aiDiagram: AiDiagram = {
    direction: 'TB',
    nodes,
    edges,
  };

  return normalizeAiDiagram(aiDiagram).diagram;
}

function capitalize(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

/**
 * Slightly smarter demo generator for one-paragraph descriptions.
 * It recognises the common "if X, do Y; otherwise do Z" shape before falling
 * back to the sequential workflow parser.
 */
export function descriptionToDiagram(description: string): FlowDiagram {
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Error('Describe the flowchart you want to create.');
  }

  const conditional = text.match(
    /^(.*?)\b(?:if|when)\s+(.+?),\s*(?:then\s+)?(.+?)(?:[;]\s*|\s+)(?:otherwise|else)[,:]?\s+(.+?)[.!]?$/i,
  );

  if (conditional) {
    const prefix = conditional[1].replace(/\b(and|then)\s*$/i, '').trim();
    const condition = conditional[2].trim();
    const yesAction = conditional[3].replace(/[;,]\s*$/, '').trim();
    const noAction = conditional[4].replace(/[.!]\s*$/, '').trim();

    const nodes: AiNode[] = [];
    const edges: AiEdge[] = [];
    const add = (label: string, shape: NodeShape, id?: string): string => {
      const nextId = id ?? `desc-${nodes.length + 1}`;
      nodes.push({ id: nextId, label: capitalize(label), shape });
      return nextId;
    };
    const connect = (source: string, target: string, label?: string) => {
      edges.push({ source, target, label });
    };

    const startId = add('Start', 'startEnd', 'desc-start');
    let previous = startId;
    const prefixSteps = prefix
      .split(/[,;.]/)
      .map((step) => cleanLine(step).replace(/^(and|then)\s+/i, ''))
      .filter(Boolean);

    for (const step of prefixSteps) {
      const id = add(step, detectShape(step));
      connect(previous, id);
      previous = id;
    }

    const decisionId = add(decisionLabel(condition), 'decision', 'desc-decision');
    connect(previous, decisionId);

    const yesId = add(yesAction || 'Continue', detectShape(yesAction));
    const noId = add(noAction || 'Stop', detectShape(noAction));
    connect(decisionId, yesId, 'Yes');
    connect(decisionId, noId, 'No');

    const endId = add('Done', 'startEnd', 'desc-end');
    connect(yesId, endId);
    connect(noId, endId);

    return normalizeAiDiagram({ direction: 'TB', nodes, edges }).diagram;
  }

  // For one-paragraph sequential descriptions, commas are usually step
  // separators. Multi-line text is handled by textToDiagram directly.
  if (!/[\r\n]/.test(description) && /[,;]/.test(text)) {
    const chunks = text
      .split(/[,;.]/)
      .map((chunk) => cleanLine(chunk).replace(/^(and|then)\s+/i, ''))
      .filter(Boolean);
    if (chunks.length > 1) {
      return textToDiagram(chunks.join('\n'));
    }
  }

  return textToDiagram(text);
}
