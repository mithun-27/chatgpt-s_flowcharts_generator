import type { AiDiagram, AiEdge, AiNode, FlowDiagram, LayoutDirection, NodeShape } from '../types/diagram';
import { normalizeAiDiagram } from './diagram';

const SKIP_LINE =
  /^(subgraph\b|end\b|direction\b|classDef\b|class\b|style\b|linkStyle\b|click\b|accTitle\b|accDescr\b|%%|title\b)/i;

export function isMermaid(text: string): boolean {
  return /^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|LR|RL)\b/im.test(text);
}

function unquote(value: string): string {
  let result = value.trim();
  if (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'"))
  ) {
    result = result.slice(1, -1);
  }
  return result
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNodeExpression(expression: string): { id: string; label: string; shape: NodeShape } | null {
  const value = expression
    .trim()
    .replace(/\s*:::[A-Za-z0-9_-]+(?:\s*,.*)?$/, '')
    .trim();
  if (!value) return null;

  const match = value.match(/^([A-Za-z_][A-Za-z0-9_-]*|[0-9]+)([\s\S]*)$/);
  if (!match) return null;
  const id = match[1];
  const rest = match[2].trim();

  if (!rest) {
    return { id, label: id, shape: 'process' };
  }

  const patterns: Array<{ regex: RegExp; shape: NodeShape }> = [
    { regex: /^\(\((.+)\)\)$/s, shape: 'connector' },
    { regex: /^\(\[(.+)\]\)$/s, shape: 'startEnd' },
    { regex: /^\[\[(.+)\]\]$/s, shape: 'process' },
    { regex: /^\[\/(.+)\/\]$/s, shape: 'inputOutput' },
    { regex: /^\[\\(.+)\\\]$/s, shape: 'inputOutput' },
    { regex: /^\[\/(.+)\\\]$/s, shape: 'inputOutput' },
    { regex: /^\{\{(.+)\}\}$/s, shape: 'decision' },
    { regex: /^\[(.+)\]$/s, shape: 'process' },
    { regex: /^\{(.+)\}$/s, shape: 'decision' },
    { regex: /^\((.+)\)$/s, shape: 'process' },
    { regex: /^>(.+)\]$/s, shape: 'document' },
  ];

  for (const pattern of patterns) {
    const shapeMatch = rest.match(pattern.regex);
    if (shapeMatch) {
      return {
        id,
        label: unquote(shapeMatch[1]) || id,
        shape: pattern.shape,
      };
    }
  }

  return { id, label: id, shape: 'process' };
}

function splitLabeledLinks(line: string): string[] {
  const normalized = line
    .replace(/--\s+([^|>\n]+?)\s+-->/g, '-->|$1|')
    .replace(/==\s+([^|>\n]+?)\s+==>/g, '==>|$1|')
    .replace(/-\.\s+([^|>\n]+?)\s+\.->/g, '-.->|$1|');
  return normalized.split(/\s*(-->|---|==>|-\.->)\s*/);
}

export function parseMermaid(code: string): FlowDiagram {
  const cleaned = code.replace(/```mermaid/gi, '').replace(/```/g, '');
  const lines = cleaned.split(/\r?\n/);
  const directionLine = lines.find((line) => /^\s*(?:flowchart|graph)\s+/i.test(line));
  if (!directionLine) {
    throw new Error('Mermaid code must start with "flowchart TD" or "graph LR".');
  }

  const directionToken =
    directionLine.match(/^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i)?.[1]?.toUpperCase() ??
    'TD';
  const direction: LayoutDirection =
    directionToken === 'LR' || directionToken === 'RL' ? 'LR' : 'TB';

  const nodeMap = new Map<string, AiNode>();
  const edges: AiEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (source: string, target: string, label?: string) => {
    if (source === target) return;
    const key = `${source}|${target}|${label ?? ''}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, label: label || undefined });
  };

  const registerNode = (parsed: ReturnType<typeof parseNodeExpression>) => {
    if (!parsed) return;
    const existing = nodeMap.get(parsed.id);
    if (!existing) {
      nodeMap.set(parsed.id, {
        id: parsed.id,
        label: parsed.label,
        shape: parsed.shape,
      });
      return;
    }
    if (parsed.label && parsed.label !== parsed.id) {
      existing.label = parsed.label;
      existing.shape = parsed.shape;
    }
  };

  const statements: string[] = [];
  let inFrontmatter = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    if (SKIP_LINE.test(line)) continue;
    for (const part of line.split(';')) {
      if (part.trim()) statements.push(part.trim());
    }
  }

  let statementCount = 0;
  for (const statement of statements) {
    if (/^\s*(?:flowchart|graph)\s+/i.test(statement)) continue;
    const parts = splitLabeledLinks(statement);
    if (parts.length === 1) {
      registerNode(parseNodeExpression(parts[0]));
      statementCount += 1;
      continue;
    }

    let current = parts[0]
      .split('&')
      .map((part) => parseNodeExpression(part))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    current.forEach(registerNode);

    for (let index = 1; index < parts.length; index += 2) {
      const operator = parts[index];
      if (!operator) continue;
      let nextPart = parts[index + 1] ?? '';
      let label = '';
      const labelMatch = nextPart.match(/^\s*\|([^|]*)\|\s*([\s\S]*)$/);
      if (labelMatch) {
        label = unquote(labelMatch[1]);
        nextPart = labelMatch[2];
      }

      const targets = nextPart
        .split('&')
        .map((part) => parseNodeExpression(part))
        .filter((node): node is NonNullable<typeof node> => Boolean(node));
      if (targets.length === 0) continue;
      targets.forEach(registerNode);

      for (const source of current) {
        for (const target of targets) {
          addEdge(source.id, target.id, label);
        }
      }
      current = targets;
      statementCount += 1;
    }
  }

  if (nodeMap.size === 0) {
    throw new Error('No Mermaid nodes were found. Try a simple "flowchart TD" diagram.');
  }

  const aiDiagram: AiDiagram = {
    direction,
    nodes: [...nodeMap.values()],
    edges,
  };

  const { diagram } = normalizeAiDiagram(aiDiagram, direction);
  return statementCount > 0 ? diagram : { ...diagram, direction };
}

function escapeMermaidLabel(value: string): string {
  return value
    .replace(/"/g, "'")
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, '<br/>')
    .trim();
}

export function generateMermaid(diagram: FlowDiagram): string {
  const ids = new Map<string, string>();
  diagram.nodes.forEach((node, index) => ids.set(node.id, `n${index + 1}`));

  const lines = [`flowchart ${diagram.direction}`];

  for (const node of diagram.nodes) {
    const id = ids.get(node.id);
    if (!id) continue;
    const label = escapeMermaidLabel(node.data.label);
    switch (node.data.shape) {
      case 'startEnd':
        lines.push(`  ${id}(["${label}"])`);
        break;
      case 'decision':
        lines.push(`  ${id}{"${label}"}`);
        break;
      case 'inputOutput':
        lines.push(`  ${id}[/"${label}"/]`);
        break;
      case 'document':
        lines.push(`  ${id}>"${label}"]`);
        break;
      case 'connector':
        lines.push(`  ${id}(("${label}"))`);
        break;
      default:
        lines.push(`  ${id}["${label}"]`);
    }
  }

  for (const edge of diagram.edges) {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (!source || !target) continue;
    const label = edge.label ? escapeMermaidLabel(String(edge.label)) : '';
    lines.push(`  ${source} -->${label ? `|${label}|` : ''} ${target}`);
  }

  if (diagram.nodes.some((node) => node.data.shape === 'document')) {
    lines.push('  %% Document shapes use Mermaid flag notation (no native document shape).');
  }

  return lines.join('\n');
}
