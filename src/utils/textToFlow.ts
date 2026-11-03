import type {
  AiDiagram,
  AiEdge,
  AiNode,
  FlowDiagram,
  LayoutDirection,
  NodeShape,
} from '../types/diagram';
import { normalizeAiDiagram } from './diagram';
import { looksLikeAsciiFlowchart, parseAsciiFlowchart } from './asciiFlow';
import {
  branchKind,
  capitalizeFirst,
  cleanSourceLine,
  decisionLabel,
  detectShape,
  extractTitle,
  hasInlineArrow,
  isLoopPhrase,
  matchLoopPhrase,
  splitInlineArrows,
  stripCodeFences,
} from './flowHeuristics';

export interface TextToDiagramOptions {
  direction?: LayoutDirection;
}

interface SourceBlock {
  lines: string[];
  indents: number[];
}

interface PendingLoop {
  from: string;
  target: string;
  label: string;
}

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)]|step\s*\d+\s*[:.)-])\s+/i;

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function isListLine(line: string): boolean {
  return LIST_MARKER.test(line);
}

function isBranchLine(line: string): boolean {
  return (
    /^(?:yes|no|y|n|true|false)\b\s*[:,-]?\s*/i.test(line) ||
    /^(?:otherwise|else)\b\s*[,:]?\s*/i.test(line)
  );
}

function looksLikeAgentName(value: string): boolean {
  const text = cleanSourceLine(value);
  if (!text) return false;
  if (
    /\b(agent|assistant|bot|worker|service|module|stage|phase|component|engine|manager|team|system|node|actor|role|layer|gateway|processor)\s*$/i.test(
      text,
    )
  ) {
    return true;
  }
  return /:\s*$/.test(value.trim());
}

function startsNewBlock(line: string, block: SourceBlock): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (isListLine(line)) return true;
  if (isBranchLine(trimmed)) return true;
  if (block.lines.length === 0) return false;

  const first = block.lines[0];
  const firstText = cleanSourceLine(first);
  const currentIndent = indentOf(line);
  const firstIndent = block.indents[0] ?? 0;

  // Indented text below a numbered or bulleted item is its description.
  if (isListLine(first) && currentIndent > firstIndent) return false;

  if (looksLikeAgentName(firstText) && block.lines.length <= 2) {
    if (/^[&+(]/.test(trimmed) || /^(?:and|with|using|including)\b/i.test(trimmed)) {
      return false;
    }
    if (block.lines.length === 1) return false;
  }

  // A lowercase continuation directly under a list item is a description.
  if (isListLine(first) && /^[a-z(]/.test(trimmed) && block.lines.length === 1) {
    return false;
  }

  return true;
}

function buildBlocks(text: string): SourceBlock[] {
  const lines = stripCodeFences(text).replace(/\r\n/g, '\n').split('\n');
  const blocks: SourceBlock[] = [];
  let current: SourceBlock | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    if (/^[-=_*]{3,}$/.test(trimmed)) continue;

    if (!current) {
      current = { lines: [raw], indents: [indentOf(raw)] };
      continue;
    }

    if (startsNewBlock(raw, current)) {
      blocks.push(current);
      current = { lines: [raw], indents: [indentOf(raw)] };
    } else {
      current.lines.push(raw);
      current.indents.push(indentOf(raw));
    }
  }

  if (current) blocks.push(current);
  return blocks;
}

function cleanBlockLabel(value: string): string {
  return value
    .split('\n')
    .map((line) => capitalizeFirst(cleanSourceLine(line)))
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')
    .slice(0, 200);
}

function blockUnits(block: SourceBlock): string[] {
  const labelled = block.lines.map(cleanBlockLabel).filter(Boolean);
  if (labelled.length === 0) return [];

  const arrowLine = block.lines.some((line) => hasInlineArrow(line));
  if (!arrowLine) return [labelled.join('\n')];

  const units: string[] = [];
  for (const line of block.lines) {
    if (!line.trim()) continue;
    if (hasInlineArrow(line)) {
      units.push(...splitInlineArrows(line));
      continue;
    }
    const cleaned = cleanBlockLabel(line);
    if (!cleaned) continue;
    if (units.length > 0) units[units.length - 1] = `${units[units.length - 1]}\n${cleaned}`;
    else units.push(cleaned);
  }
  return units;
}

function parseConditional(
  value: string,
): { condition: string; yes?: string; no?: string } | null {
  const match = value.match(
    /^(?:if|when)\s+(.+?)(?:\s*[,;]\s*|\s+then\s+)(.+?)(?:\s*(?:[,;]\s*)?(?:otherwise|else)\s*[,:]?\s*(.+))?$/i,
  );
  if (!match) return null;

  const condition = match[1]?.trim();
  const yes = match[2]?.replace(/^then\s+/i, '').trim();
  const no = match[3]?.replace(/^then\s+/i, '').trim();
  if (!condition || !yes) return null;
  return {
    condition,
    yes: yes || undefined,
    no: no || undefined,
  };
}

function resolveLoopTarget(targetLabel: string, nodes: AiNode[]): AiNode | undefined {
  const target = targetLabel.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!target) return undefined;

  const stepMatch = target.match(/\b(?:step|steps?)\s*(\d+)\b/);
  if (stepMatch) {
    const node = nodes[Number(stepMatch[1]) - 1];
    if (node) return node;
  }

  const clean = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const score = (label: string): number => {
    const firstLine = clean(label.split('\n')[0] ?? '');
    if (!firstLine) return 0;
    if (firstLine === target) return 1;
    if (firstLine.includes(target) || target.includes(firstLine)) return 0.8;

    const targetWords = new Set(target.split(/[^a-z0-9]+/).filter((word) => word.length > 2));
    const labelWords = new Set(firstLine.split(/[^a-z0-9]+/).filter((word) => word.length > 2));
    if (targetWords.size === 0 || labelWords.size === 0) return 0;
    const overlap = [...targetWords].filter((word) => labelWords.has(word)).length;
    return overlap / Math.min(targetWords.size, labelWords.size);
  };

  return nodes
    .map((node) => ({ node, value: score(node.label) }))
    .filter((item) => item.value >= 0.5)
    .sort((a, b) => b.value - a.value)[0]?.node;
}

function parseLooseWorkflow(text: string, direction: LayoutDirection): AiDiagram {
  const extracted = extractTitle(text);
  const blocks = buildBlocks(extracted.body);
  if (blocks.length === 0) {
    throw new Error('Paste a workflow with at least one step.');
  }

  const nodes: AiNode[] = [];
  const edges: AiEdge[] = [];
  const seenEdges = new Set<string>();
  const pendingLoops: PendingLoop[] = [];

  let previous: string | null = null;
  let lastDecision: string | null = null;
  let awaitingBranch: 'yes' | 'no' | null = null;
  /** Tails of a decision that should both connect to the next shared step. */
  let mergeTails: string[] = [];
  let branchTails: { decision: string; yes?: string; no?: string } | null = null;

  const addNode = (label: string, shape: NodeShape): string => {
    const id = `local-${nodes.length + 1}`;
    nodes.push({ id, label, shape });
    return id;
  };

  const addEdge = (source: string, target: string, label?: string): void => {
    if (!source || !target || source === target) return;
    const clean = label ? cleanSourceLine(label) : '';
    const key = `${source}|${target}|${clean}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ source, target, ...(clean ? { label: clean } : {}) });
  };

  const noteBranchTail = (kind: 'yes' | 'no', id: string): void => {
    if (!lastDecision) return;
    if (!branchTails || branchTails.decision !== lastDecision) {
      branchTails = { decision: lastDecision };
    }
    branchTails[kind] = id;
  };

  const convergeBranches = (): void => {
    if (!branchTails) return;
    const { yes, no } = branchTails;
    if (yes && no && yes !== no) mergeTails = [yes, no];
  };

  const registerNode = (rawLabel: string, shapeOverride?: NodeShape): string => {
    const label = cleanBlockLabel(rawLabel);
    if (!label) return previous ?? '';
    const shape = shapeOverride ?? detectShape(label);
    const id = addNode(label, shape);

    if (awaitingBranch && lastDecision) {
      addEdge(lastDecision, id, awaitingBranch === 'yes' ? 'Yes' : 'No');
      noteBranchTail(awaitingBranch, id);
      awaitingBranch = null;
      // The opposite branch now has a shared continuation, so join them here.
      if (branchTails) {
        const other = branchTails.yes === id ? branchTails.no : branchTails.no === id ? branchTails.yes : undefined;
        if (other) addEdge(other, id);
      }
      mergeTails = [];
    } else if (mergeTails.length > 0) {
      for (const tail of mergeTails) addEdge(tail, id);
      mergeTails = [];
    } else if (previous) {
      const previousNode = nodes.find((node) => node.id === previous);
      addEdge(previous, id, previousNode?.shape === 'decision' ? 'Yes' : undefined);
    }

    previous = id;
    if (shape === 'decision') {
      lastDecision = id;
      awaitingBranch = 'yes';
      branchTails = { decision: id };
      mergeTails = [];
    }
    return id;
  };

  const handleBranch = (kind: 'yes' | 'no', rawLabel: string): void => {
    const label = cleanBlockLabel(rawLabel);
    if (!lastDecision) {
      if (label) registerNode(label);
      return;
    }

    if (!label) {
      awaitingBranch = kind;
      return;
    }

    const shape = detectShape(label);
    const id = addNode(label, shape);
    addEdge(lastDecision, id, kind === 'yes' ? 'Yes' : 'No');
    noteBranchTail(kind, id);
    previous = id;
    awaitingBranch = null;
    convergeBranches();

    if (shape === 'decision') {
      lastDecision = id;
      awaitingBranch = 'yes';
      branchTails = { decision: id };
      mergeTails = [];
    }
  };

  const handleConditional = (parsed: {
    condition: string;
    yes?: string;
    no?: string;
  }): void => {
    const decisionId = registerNode(decisionLabel(parsed.condition), 'decision');
    if (!decisionId) return;

    let yesId = '';
    let noId = '';

    if (parsed.yes) {
      yesId = addNode(cleanBlockLabel(parsed.yes), detectShape(parsed.yes));
      addEdge(decisionId, yesId, 'Yes');
      noteBranchTail('yes', yesId);
    }

    if (parsed.no) {
      noId = addNode(cleanBlockLabel(parsed.no), detectShape(parsed.no));
      addEdge(decisionId, noId, 'No');
      noteBranchTail('no', noId);
    }

    if (yesId && noId) {
      previous = noId;
      awaitingBranch = null;
      convergeBranches();
      return;
    }

    if (yesId) {
      // A following "Otherwise" fills in the No branch; otherwise the next
      // step is treated as the No continuation and merges both paths.
      previous = yesId;
      awaitingBranch = 'no';
      return;
    }

    previous = decisionId;
    awaitingBranch = 'yes';
  };

  const handleLoop = (value: string): boolean => {
    const loop = matchLoopPhrase(value);
    if (!loop) return false;

    let from = previous;
    const prefix = cleanBlockLabel(loop.prefix);
    if (prefix && !/^(?:then|and|finally|next)$/i.test(prefix)) {
      const current = previous ? nodes.find((node) => node.id === previous) : undefined;
      const currentFirst = current?.label.split('\n')[0]?.trim().toLowerCase() ?? '';
      if (current && currentFirst === prefix.toLowerCase()) {
        from = previous;
      } else {
        from = registerNode(prefix);
      }
    }

    if (from) {
      // A looping tail does not continue into the following shared step.
      mergeTails = mergeTails.filter((tail) => tail !== from);
      pendingLoops.push({
        from,
        target: loop.target,
        label: /retry|repeat/i.test(value) ? 'Retry' : 'Again',
      });
    }
    return true;
  };

  for (const block of blocks) {
    for (const unit of blockUnits(block)) {
      const lines = unit.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      const firstLine = lines[0];
      const flat = lines.join(' ');

      const yesNo = firstLine.match(/^(yes|no|y|n|true|false)\b\s*[:,-]?\s*(.*)$/i);
      if (yesNo) {
        const kind = branchKind(yesNo[1] ?? '') ?? 'yes';
        const rest = [yesNo[2] ?? '', ...lines.slice(1)].join('\n');
        handleBranch(kind, rest);
        continue;
      }

      const otherwise = firstLine.match(/^(otherwise|else)\b\s*[,:]?\s*(.*)$/i);
      if (otherwise) {
        const rest = [otherwise[2] ?? '', ...lines.slice(1)].join('\n');
        handleBranch('no', rest);
        continue;
      }

      if (isLoopPhrase(flat) && handleLoop(flat)) continue;

      const conditional = parseConditional(flat);
      if (conditional) {
        handleConditional(conditional);
        continue;
      }

      if (/^(if|when|whether)\b/i.test(firstLine)) {
        registerNode(decisionLabel(firstLine), 'decision');
        if (lines.length > 1) {
          registerNode(lines.slice(1).join('\n'));
        }
        continue;
      }

      registerNode(unit);
    }
  }

  for (const loop of pendingLoops) {
    const target = resolveLoopTarget(loop.target, nodes);
    if (target?.id) addEdge(loop.from, target.id, loop.label);
  }

  if (nodes.length === 0) {
    throw new Error('Could not find any steps in that text.');
  }

  return {
    ...(extracted.title ? { title: extracted.title } : {}),
    direction,
    nodes,
    edges,
  };
}

/**
 * Deterministic text-to-flowchart converter. Boxed ASCII diagrams and vertical
 * arrow flows are parsed geometrically; ordinary text is grouped into logical
 * steps before connections are inferred. No network access is required.
 */
export function textToDiagram(
  text: string,
  options: TextToDiagramOptions = {},
): FlowDiagram {
  if (!text || !text.trim()) {
    throw new Error('Paste a workflow with at least one step.');
  }

  const direction = options.direction ?? 'TB';

  if (looksLikeAsciiFlowchart(text)) {
    try {
      const ascii = parseAsciiFlowchart(text, direction);
      return normalizeAiDiagram(ascii, direction).diagram;
    } catch {
      // Fall through to the linear parser for decorative or unusual ASCII.
    }
  }

  const local = parseLooseWorkflow(text, direction);
  return normalizeAiDiagram(local, direction).diagram;
}

/**
 * Slightly smarter demo generator for one-paragraph descriptions. It handles
 * the common "if X, do Y; otherwise do Z" shape and splits comma/sentence
 * separated descriptions before falling back to the normal text parser.
 */
export function descriptionToDiagram(
  description: string,
  options: TextToDiagramOptions = {},
): FlowDiagram {
  const direction = options.direction ?? 'TB';
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Error('Describe the flowchart you want to create.');
  }

  if (/[\r\n]/.test(description)) {
    return textToDiagram(description, options);
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
      nodes.push({ id: nextId, label: capitalizeFirst(label), shape });
      return nextId;
    };
    const connect = (source: string, target: string, label?: string) => {
      edges.push({ source, target, label });
    };

    const startId = add('Start', 'startEnd', 'desc-start');
    let previous = startId;
    const prefixSteps = prefix
      .split(/[,;.]/)
      .map((step) => cleanSourceLine(step).replace(/^(and|then)\s+/i, ''))
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

    return normalizeAiDiagram({ direction, nodes, edges }, direction).diagram;
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    return textToDiagram(sentences.join('\n'), options);
  }

  if (/[,;]/.test(text) && !/\b(?:if|when|otherwise|else)\b/i.test(text)) {
    const chunks = text
      .split(/[,;]/)
      .map((chunk) => cleanSourceLine(chunk))
      .filter(Boolean);
    if (chunks.length > 1) {
      return textToDiagram(chunks.join('\n'), options);
    }
  }

  return textToDiagram(text, options);
}
