import type { AiDiagram, AiEdge, AiNode, LayoutDirection, NodeShape } from '../types/diagram';
import {
  branchKind,
  cleanSourceLine,
  detectShape,
  extractTitle,
  isPureBranchLabel,
} from './flowHeuristics';

interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  kind: 'box' | 'free';
  top: number;
  bottom: number;
  left: number;
  right: number;
  center: number;
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  label: string;
}

interface BranchLabel {
  text: string;
  row: number;
  left: number;
  right: number;
}

interface Point {
  row: number;
  col: number;
}

const NORMALIZE: Record<string, string> = {
  '─': '-',
  '━': '-',
  '═': '-',
  '│': '|',
  '┃': '|',
  '║': '|',
  '┌': '+',
  '┐': '+',
  '└': '+',
  '┘': '+',
  '├': '+',
  '┤': '+',
  '┬': '+',
  '┴': '+',
  '┼': '+',
  '╭': '+',
  '╮': '+',
  '╯': '+',
  '╰': '+',
  '╔': '+',
  '╗': '+',
  '╚': '+',
  '╝': '+',
  '╠': '+',
  '╣': '+',
  '╦': '+',
  '╩': '+',
  '╬': '+',
  '▼': 'v',
  '▽': 'v',
  '↓': 'v',
  '▲': '^',
  '△': '^',
  '↑': '^',
  '►': '>',
  '▶': '>',
  '→': '>',
  '⇒': '>',
  '←': '<',
  '◀': '<',
  '◄': '<',
  '–': '-',
  '—': '-',
};

const CONNECTOR_ONLY = /^[\s|+\-=<>^vV/\\]+$/;
const CONNECTOR_CHARS = '|vV+';
const BORDER_ONLY = /^[+\-= ]+$/;

export function looksLikeAsciiFlowchart(text: string): boolean {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const boxed = lines.some((line) => /[+╔╗╚╝┌┐└┘╭╮╯╰][-=═─━]{2,}[+╔╗╚╝┌┐└┘╭╮╯╰]/.test(line));
  if (boxed) return true;

  const connectorLines = lines.filter(
    (line) =>
      CONNECTOR_ONLY.test(line) &&
      /[|│▼v↓^▲↑]/.test(line) &&
      line.trim().length > 0,
  );
  const textLines = lines.filter((line) => line.trim() && !CONNECTOR_ONLY.test(line));
  return connectorLines.length >= 2 && textLines.length >= 2;
}

function expandTabs(value: string): string {
  return value.replace(/\t/g, '    ');
}

function buildGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      Array.from(expandTabs(line), (character) => NORMALIZE[character] ?? character),
    );
}

function at(chars: string[][], row: number, col: number): string {
  if (row < 0 || row >= chars.length) return ' ';
  const line = chars[row];
  if (!line || col < 0 || col >= line.length) return ' ';
  return line[col];
}

function horizontalSegments(line: string): Array<{ left: number; right: number }> {
  const segments: Array<{ left: number; right: number }> = [];
  const pattern = /(\+[-=]{2,}\+)|([-=]{3,})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const value = match[1] ?? match[2] ?? '';
    segments.push({ left: match.index, right: match.index + value.length - 1 });
  }
  return segments;
}

function hasVerticalBorders(
  chars: string[][],
  top: number,
  bottom: number,
  left: number,
  right: number,
): boolean {
  for (let row = top + 1; row < bottom; row += 1) {
    if (at(chars, row, left) !== '|' || at(chars, row, right) !== '|') return false;
  }
  return true;
}

function readBoxLabel(
  chars: string[][],
  top: number,
  bottom: number,
  left: number,
  right: number,
): string {
  const lines: string[] = [];
  for (let row = top + 1; row < bottom; row += 1) {
    const raw = chars[row].slice(left + 1, right).join('');
    const cleaned = raw
      .replace(/^[|+]+\s*/, '')
      .replace(/\s*[|+]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || BORDER_ONLY.test(cleaned) || CONNECTOR_ONLY.test(cleaned)) continue;
    const text = cleanSourceLine(cleaned);
    if (text) lines.push(text);
    if (lines.length >= 3) break;
  }
  return lines.join('\n');
}

function findBoxes(chars: string[][]): Box[] {
  const segmentsByRow = chars.map((line) => horizontalSegments(line.join('')));
  const boxes: Box[] = [];
  const seen = new Set<string>();

  for (let top = 0; top < chars.length; top += 1) {
    if (!BORDER_ONLY.test(chars[top].join('').trim())) continue;
    for (const header of segmentsByRow[top]) {
      for (let bottom = top + 2; bottom < chars.length; bottom += 1) {
        if (!segmentsByRow[bottom].some((segment) => segment.left === header.left && segment.right === header.right)) {
          continue;
        }
        if (!hasVerticalBorders(chars, top, bottom, header.left, header.right)) continue;
        const label = readBoxLabel(chars, top, bottom, header.left, header.right);
        if (!label) break;
        const key = `${top}:${bottom}:${header.left}:${header.right}`;
        if (!seen.has(key)) {
          seen.add(key);
          boxes.push({
            top,
            bottom,
            left: header.left,
            right: header.right,
            label,
          });
        }
        break;
      }
    }
  }

  // Keep the largest box when a parser artefact produces nested duplicates.
  return boxes.filter(
    (box) =>
      !boxes.some(
        (other) =>
          other !== box &&
          other.label === box.label &&
          other.top <= box.top &&
          other.bottom >= box.bottom &&
          other.left <= box.left &&
          other.right >= box.right,
      ),
  );
}

function findFreeLabels(
  chars: string[][],
  boxes: Box[],
): { nodes: DiagramNode[]; branches: BranchLabel[] } {
  const nodes: DiagramNode[] = [];
  const branches: BranchLabel[] = [];

  for (let row = 0; row < chars.length; row += 1) {
    const masked = chars[row].slice();
    for (const box of boxes) {
      if (row < box.top || row > box.bottom) continue;
      for (let col = box.left; col <= box.right; col += 1) {
        if (col >= 0 && col < masked.length) masked[col] = ' ';
      }
    }
    // A remaining side border cannot be part of a label.
    for (let col = 0; col < masked.length; col += 1) {
      if (masked[col] === '|' || masked[col] === '+') masked[col] = ' ';
    }

    const line = masked.join('');
    if (!line.trim()) continue;

    const pattern = /\S+(?: \S+)*/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const raw = match[0];
      const cleaned = raw
        .replace(/^[+\-=<>^vV/\\]+/, '')
        .replace(/[+\-=<>^vV/\\]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned || CONNECTOR_ONLY.test(cleaned) || BORDER_ONLY.test(cleaned)) continue;

      const leading = raw.length - raw.trimStart().length;
      const left = match.index + leading;
      const right = left + cleaned.length - 1;

      if (isPureBranchLabel(cleaned)) {
        branches.push({ text: cleaned, row, left, right });
        continue;
      }

      nodes.push({
        id: '',
        label: cleaned,
        shape: detectShape(cleaned),
        kind: 'free',
        top: row,
        bottom: row,
        left,
        right,
        center: (left + right) / 2,
      });
    }
  }

  return { nodes, branches };
}

function overlapRatio(a: DiagramNode, b: DiagramNode): number {
  const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) + 1);
  const smallest = Math.max(1, Math.min(a.right - a.left + 1, b.right - b.left + 1));
  return overlap / smallest;
}

/**
 * "Research Agent" followed by "Market & Competitor Analysis" is one process.
 * Free labels on neighbouring rows with overlapping columns are merged into a
 * single multi-line node before edges are traced.
 */
function mergeFreeLabels(nodes: DiagramNode[]): DiagramNode[] {
  const sorted = [...nodes].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: DiagramNode[] = [];

  for (const node of sorted) {
    let target: DiagramNode | undefined;
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const candidate = merged[index];
      if (candidate.kind !== 'free') continue;
      if (node.top !== candidate.bottom + 1) continue;
      if (overlapRatio(candidate, node) >= 0.45 || Math.abs(candidate.center - node.center) <= 4) {
        target = candidate;
        break;
      }
    }

    if (!target) {
      merged.push({ ...node });
      continue;
    }

    target.label = `${target.label}\n${node.label}`.slice(0, 200);
    target.shape = detectShape(target.label);
    target.bottom = node.bottom;
    target.left = Math.min(target.left, node.left);
    target.right = Math.max(target.right, node.right);
    target.center = (target.left + target.right) / 2;
  }

  return merged;
}

function insideBox(boxes: Box[], row: number, col: number): Box | undefined {
  return boxes.find(
    (box) => row >= box.top && row <= box.bottom && col >= box.left && col <= box.right,
  );
}

function findTargetAt(
  nodes: DiagramNode[],
  row: number,
  col: number,
  sourceId: string,
): DiagramNode | undefined {
  const matches = nodes.filter((node) => {
    if (node.id === sourceId) return false;
    if (col < node.left - 1 || col > node.right + 1) return false;
    if (node.kind === 'box') return row === node.top;
    return row >= node.top && row <= node.bottom;
  });
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => Math.abs(a.center - col) - Math.abs(b.center - col));
  return matches[0];
}

function nearestVertical(chars: string[][], row: number, col: number, radius: number): number | null {
  for (let distance = 0; distance <= radius; distance += 1) {
    for (const candidate of distance === 0 ? [col] : [col - distance, col + distance]) {
      const value = at(chars, row, candidate);
      if (CONNECTOR_CHARS.includes(value)) return candidate;
      if (value === '|' || value === 'v' || value === 'V') return candidate;
    }
  }
  return null;
}

function followHorizontal(chars: string[][], row: number, col: number): number | null {
  const line = chars[row] ?? [];
  let left = col;
  let right = col;
  while (left > 0 && (line[left - 1] === '-' || line[left - 1] === '=')) left -= 1;
  while (right < line.length - 1 && (line[right + 1] === '-' || line[right + 1] === '=')) {
    right += 1;
  }

  const candidates: number[] = [];
  for (let candidate = right + 1; candidate <= Math.min(line.length - 1, right + 5); candidate += 1) {
    if (CONNECTOR_CHARS.includes(at(chars, row, candidate))) candidates.push(candidate);
  }
  if (candidates.length > 0) return candidates[0];
  for (let candidate = left - 1; candidate >= Math.max(0, left - 5); candidate -= 1) {
    if (CONNECTOR_CHARS.includes(at(chars, row, candidate))) return candidate;
  }
  return null;
}

function traceDown(
  chars: string[][],
  boxes: Box[],
  nodes: DiagramNode[],
  start: Point,
  sourceId: string,
): DiagramNode | undefined {
  let col = start.col;
  let blankRun = 0;

  for (let row = start.row; row < chars.length; row += 1) {
    const target = findTargetAt(nodes, row, col, sourceId);
    if (target) return target;

    const box = insideBox(boxes, row, col);
    if (box && row > box.top) return undefined;

    const value = at(chars, row, col);

    if (CONNECTOR_CHARS.includes(value)) {
      blankRun = 0;
      continue;
    }

    if (value === ' ') {
      const vertical = nearestVertical(chars, row, col, 2);
      if (vertical !== null) {
        col = vertical;
        blankRun = 0;
        continue;
      }
      blankRun += 1;
      if (blankRun > 3) return undefined;
      continue;
    }

    if (value === '-' || value === '=') {
      const horizontal = followHorizontal(chars, row, col);
      if (horizontal !== null) {
        col = horizontal;
        blankRun = 0;
        continue;
      }
      blankRun += 1;
      if (blankRun > 3) return undefined;
      continue;
    }

    if (value === '/') {
      col -= 1;
      blankRun = 0;
      continue;
    }

    if (value === '\\') {
      col += 1;
      blankRun = 0;
      continue;
    }

    if (value === '>') {
      const vertical = followHorizontal(chars, row, Math.max(0, col - 1));
      if (vertical !== null) {
        col = vertical;
        blankRun = 0;
        continue;
      }
      col += 1;
      blankRun = 0;
      continue;
    }

    if (value === '<') {
      col -= 1;
      blankRun = 0;
      continue;
    }

    return undefined;
  }

  return undefined;
}

function findExitPorts(node: DiagramNode, chars: string[][]): Point[] {
  const from = Math.max(0, Math.floor(node.left) - 2);
  const to = Math.ceil(node.right) + 2;

  for (let offset = 1; offset <= 5; offset += 1) {
    const row = node.bottom + offset;
    if (row >= chars.length) break;
    const columns: number[] = [];
    for (let col = from; col <= to; col += 1) {
      const value = at(chars, row, col);
      if (value === '|' || value === 'v' || value === 'V') columns.push(col);
    }
    if (columns.length === 0) continue;

    // Collapse characters that are adjacent (for example "||").
    const clusters: number[] = [];
    for (const column of columns) {
      const last = clusters[clusters.length - 1];
      if (last === undefined || column - last > 3) clusters.push(column);
      else clusters[clusters.length - 1] = Math.round((last + column) / 2);
    }

    return clusters
      .sort((a, b) => Math.abs(a - node.center) - Math.abs(b - node.center))
      .map((col) => ({ row, col }));
  }

  return [];
}

function findDiagonalBranches(
  node: DiagramNode,
  chars: string[][],
): { left?: Point; right?: Point } {
  const result: { left?: Point; right?: Point } = {};
  const from = Math.max(0, Math.floor(node.left) - 3);
  const to = Math.ceil(node.right) + 3;

  for (let row = node.bottom + 1; row <= Math.min(chars.length - 1, node.bottom + 4); row += 1) {
    for (let col = from; col <= to; col += 1) {
      const value = at(chars, row, col);
      if (value === '/' && result.left === undefined && col <= node.center + 1) {
        result.left = { row, col };
      }
      if (value === '\\' && result.right === undefined && col >= node.center - 1) {
        result.right = { row, col };
      }
    }
    if (result.left && result.right) break;
  }

  return result;
}

function findBranchStart(
  branch: Point,
  side: 'left' | 'right',
  chars: string[][],
): Point | null {
  for (let offset = 1; offset <= 6; offset += 1) {
    const row = branch.row + offset;
    if (row >= chars.length) break;
    const from = side === 'left' ? branch.col - 7 - offset : branch.col - 1;
    const to = side === 'left' ? branch.col + 1 : branch.col + 7 + offset;
    const candidates: number[] = [];
    for (let col = from; col <= to; col += 1) {
      if (CONNECTOR_CHARS.includes(at(chars, row, col))) candidates.push(col);
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => Math.abs(a - branch.col) - Math.abs(b - branch.col));
      return { row, col: candidates[0] };
    }
  }
  return null;
}

function labelForBranch(
  side: 'left' | 'right',
  node: DiagramNode,
  branch: Point,
  target: DiagramNode | undefined,
  labels: BranchLabel[],
): string {
  const limit = target?.top ?? branch.row + 8;
  const candidates = labels.filter((label) => {
    if (label.row < branch.row || label.row > limit) return false;
    const center = (label.left + label.right) / 2;
    return side === 'left' ? center <= node.center : center >= node.center;
  });

  if (candidates.length > 0) {
    const exact = candidates.find((label) => branchKind(label.text) !== null);
    return cleanSourceLine(exact?.text ?? candidates[0].text) || (side === 'left' ? 'Yes' : 'No');
  }

  return side === 'left' ? 'Yes' : 'No';
}

function addEdge(
  edges: AiEdge[],
  seen: Set<string>,
  source: string,
  target: string,
  label?: string,
): void {
  if (!source || !target || source === target) return;
  const clean = label ? cleanSourceLine(label) : '';
  const key = `${source}|${target}|${clean}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target, ...(clean ? { label: clean } : {}) });
}

function buildLayoutNodes(
  boxes: Box[],
  freeNodes: DiagramNode[],
): DiagramNode[] {
  const boxNodes: DiagramNode[] = boxes.map((box) => ({
    id: '',
    label: box.label,
    shape: detectShape(box.label),
    kind: 'box',
    top: box.top,
    bottom: box.bottom,
    left: box.left,
    right: box.right,
    center: (box.left + box.right) / 2,
  }));

  const nodes = [...boxNodes, ...mergeFreeLabels(freeNodes)].sort(
    (a, b) => a.top - b.top || a.left - b.left,
  );

  nodes.forEach((node, index) => {
    node.id = `ascii-${index + 1}`;
  });

  return nodes;
}

function assignBranchLabels(
  ports: Point[],
  node: DiagramNode,
  labels: BranchLabel[],
  chars: string[][],
  boxes: Box[],
  nodes: DiagramNode[],
  sourceId: string,
): Array<{ target: DiagramNode; label: string }> {
  const results: Array<{ target: DiagramNode; label: string }> = [];
  const sorted = [...ports].sort((a, b) => a.col - b.col);

  for (const port of sorted) {
    const target = traceDown(chars, boxes, nodes, port, sourceId);
    if (!target) continue;
    const side = port.col < node.center ? 'left' : 'right';
    const explicit = labels
      .filter((label) => label.row >= port.row && label.row <= target.top + 1)
      .filter((label) => {
        const center = (label.left + label.right) / 2;
        return side === 'left' ? center <= node.center : center >= node.center;
      })
      .find((label) => branchKind(label.text) !== null);
    const fallback = side === 'left' ? 'Yes' : 'No';
    results.push({
      target,
      label: explicit ? cleanSourceLine(explicit.text) : fallback,
    });
  }

  return results;
}

export function parseAsciiFlowchart(
  input: string,
  direction: LayoutDirection = 'TB',
): AiDiagram {
  const extracted = extractTitle(input);
  const chars = buildGrid(extracted.body);
  const boxes = findBoxes(chars);
  const free = findFreeLabels(chars, boxes);
  const nodes = buildLayoutNodes(boxes, free.nodes);

  if (nodes.length === 0) {
    throw new Error('No flowchart boxes or labels were found in that ASCII diagram.');
  }

  const edges: AiEdge[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const branches = findDiagonalBranches(node, chars);

    if (branches.left || branches.right) {
      let madeBranch = false;
      for (const side of ['left', 'right'] as const) {
        const branch = branches[side];
        if (!branch) continue;
        const start = findBranchStart(branch, side, chars);
        if (!start) continue;
        const target = traceDown(chars, boxes, nodes, start, node.id);
        if (!target) continue;
        addEdge(edges, seen, node.id, target.id, labelForBranch(side, node, branch, target, free.branches));
        madeBranch = true;
      }

      if (!madeBranch) {
        const ports = findExitPorts(node, chars);
        const target = ports.length > 0
          ? traceDown(chars, boxes, nodes, ports[0], node.id)
          : undefined;
        if (target) addEdge(edges, seen, node.id, target.id);
      }
      continue;
    }

    const ports = findExitPorts(node, chars);
    if (ports.length === 0) continue;

    if (ports.length > 1) {
      const targets = assignBranchLabels(ports, node, free.branches, chars, boxes, nodes, node.id);
      for (const item of targets) {
        addEdge(edges, seen, node.id, item.target.id, item.label);
      }
      continue;
    }

    const target = traceDown(chars, boxes, nodes, ports[0], node.id);
    if (target) addEdge(edges, seen, node.id, target.id);
  }

  // If an unusual diagram has readable nodes but no traceable connectors, keep
  // it useful by falling back to the reading order.
  if (edges.length === 0 && nodes.length > 1) {
    for (let index = 1; index < nodes.length; index += 1) {
      addEdge(edges, seen, nodes[index - 1].id, nodes[index].id);
    }
  }

  const aiNodes: AiNode[] = nodes.map((node) => ({
    id: node.id,
    label: node.label,
    shape: node.shape,
  }));

  return {
    ...(extracted.title ? { title: extracted.title } : {}),
    direction,
    nodes: aiNodes,
    edges,
  };
}
