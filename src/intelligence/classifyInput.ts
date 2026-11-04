import type { InputKind } from '../types/diagram';
import { looksLikeAsciiFlowchart } from '../utils/asciiFlow';

export interface InputClassification {
  kind: InputKind;
  confidence: number;
  scores: Record<InputKind, number>;
  signals: string[];
}

const LIST_LINE = /^\s*(?:[-*•]|\d+[.)]|step\s*\d+\s*[:.)-])\s+\S+/i;
const HEADING = /^\s*#{1,6}\s+\S+/m;
const CODE_FENCE = /```/;

const SIGNALS: Array<{ kind: InputKind; pattern: RegExp; weight: number; label: string }> = [
  {
    kind: 'mermaid',
    pattern: /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|journey|mindmap|timeline)\b/im,
    weight: 0.99,
    label: 'Mermaid diagram syntax',
  },
  {
    kind: 'ascii',
    pattern: /[+╔╗╚╝┌┐└┘╭╮╯╰][-=═─━]{3,}[+╔╗╚╝┌┐└┘╭╮╯╰]/,
    weight: 0.92,
    label: 'boxed ASCII diagram',
  },
  {
    kind: 'agent-workflow',
    pattern:
      /\b(agent|multi[- ]agent|orchestrator|planner|executor|worker|tool[- ]?calling|function[- ]?calling|llm|rag|retrieval|embedding|vector store|memory|mcp|autonomous)\b/i,
    weight: 0.82,
    label: 'agent/LLM terminology',
  },
  {
    kind: 'architecture',
    pattern:
      /\b(architecture|system design|microservice|service mesh|component diagram|database|message queue|load balancer|api gateway|cache|frontend|backend|kubernetes|container|deployment|infrastructure)\b/i,
    weight: 0.8,
    label: 'software architecture terminology',
  },
  {
    kind: 'technical-doc',
    pattern:
      /\b(api|endpoint|request|response|payload|schema|webhook|configuration|install|repository|pull request|authentication|authorization|documentation|sdk)\b/i,
    weight: 0.72,
    label: 'technical documentation terminology',
  },
  {
    kind: 'business-process',
    pattern:
      /\b(customer|patient|order|invoice|payment|refund|approval|employee|department|procurement|sla|kpi|ticket|onboarding|checkout|subscription|inventory)\b/i,
    weight: 0.7,
    label: 'business process terminology',
  },
  {
    kind: 'chatgpt-response',
    pattern:
      /(^|\n)\s*(?:sure|certainly|of course|here(?:'s| is)|let me|i(?:'ll| will)|below is|the following)\b|(^|\n)\s*(?:#{2,6}|\*\*[^*]+\*\*:?)\s*/im,
    weight: 0.66,
    label: 'conversational/markdown response',
  },
  {
    kind: 'numbered-steps',
    pattern: /(^|\n)\s*(?:\d+[.)]|step\s*\d+\s*[:.)-])\s+\S+/im,
    weight: 0.64,
    label: 'numbered or step list',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Classifies the pasted input before any parsing. This is intentionally
 * multi-signal: a ChatGPT answer often contains numbered steps, technical
 * terms and markdown, so the highest score wins rather than the first match.
 */
export function classifyInput(text: string): InputClassification {
  const value = text.replace(/\r\n/g, '\n');
  const trimmed = value.trim();
  const lines = value.split('\n');
  const scores: Record<InputKind, number> = {
    'natural-language': 0.32,
    'chatgpt-response': 0,
    ascii: 0,
    screenshot: 0,
    mermaid: 0,
    'numbered-steps': 0,
    'technical-doc': 0,
    'agent-workflow': 0,
    architecture: 0,
    'business-process': 0,
  };
  const signals: string[] = [];

  if (!trimmed) {
    return {
      kind: 'natural-language',
      confidence: 1,
      scores,
      signals: ['empty input'],
    };
  }

  if (/^data:image\//i.test(trimmed)) {
    scores.screenshot = 1;
    signals.push('image data URL');
  }

  for (const item of SIGNALS) {
    if (item.pattern.test(value)) {
      scores[item.kind] += item.weight;
      signals.push(item.label);
    }
  }

  if (looksLikeAsciiFlowchart(value)) {
    scores.ascii = Math.max(scores.ascii, 0.97);
    if (!signals.includes('ASCII connectors and boxes')) signals.push('ASCII connectors and boxes');
  }

  const listLines = lines.filter((line) => LIST_LINE.test(line)).length;
  const nonEmpty = lines.filter((line) => line.trim()).length || 1;
  if (listLines >= 2) {
    const ratio = listLines / nonEmpty;
    scores['numbered-steps'] += 0.3 + ratio * 0.35;
    signals.push(`${listLines} structured list item(s)`);
  }

  if (HEADING.test(value)) {
    scores['chatgpt-response'] += 0.08;
    scores['technical-doc'] += 0.06;
    signals.push('markdown headings');
  }
  if (CODE_FENCE.test(value)) {
    scores['technical-doc'] += 0.1;
    scores['chatgpt-response'] += 0.06;
    signals.push('code fences');
  }

  // Multiple named agent roles make this an agent workflow even when the
  // steps are drawn with ASCII arrows.
  const agentMentions = (
    value.match(/\b(?:agents?|multi-agents?|orchestrator|planner|executor|worker)\b/gi) ?? []
  ).length;
  if (agentMentions >= 2) {
    scores['agent-workflow'] += 0.16;
    signals.push(`${agentMentions} named agent role(s)`);
  }

  // Conversational framing plus several bold labels is a ChatGPT response,
  // even when the content also contains business nouns.
  const boldLabels = (value.match(/\*\*[^*]+\*\*/g) ?? []).length;
  if (
    boldLabels >= 2 &&
    /(^|\n)\s*(?:sure|certainly|of course|here(?:'s| is)|below is|let me)\b/i.test(value)
  ) {
    scores['chatgpt-response'] += 0.16;
    signals.push('conversational framing with structured labels');
  }

  const sentences = trimmed.split(/[.!?]+\s+|\n{2,}/).filter((sentence) => sentence.trim());
  if (sentences.length >= 3 && scores['natural-language'] < 0.5) {
    scores['natural-language'] += 0.16;
  }

  // "Build an AI agent..." with arrows is a workflow, not an architecture doc.
  const arrowCount = (value.match(/[→⟶⇒]|-->|==>/g) ?? []).length;
  if (arrowCount >= 2) {
    scores['agent-workflow'] += 0.08;
    scores['natural-language'] += 0.06;
    signals.push(`${arrowCount} inline arrows`);
  }

  const priority: InputKind[] = [
    'mermaid',
    'ascii',
    'screenshot',
    'numbered-steps',
    'agent-workflow',
    'architecture',
    'technical-doc',
    'business-process',
    'chatgpt-response',
    'natural-language',
  ];

  let best: InputKind = 'natural-language';
  let bestScore = -1;
  for (const kind of priority) {
    if (scores[kind] > bestScore) {
      best = kind;
      bestScore = scores[kind];
    }
  }

  const sorted = priority
    .map((kind) => scores[kind])
    .sort((a, b) => b - a);
  const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0);
  const confidence = clamp(0.52 + margin * 0.9 + bestScore * 0.12, 0.5, 0.99);

  return {
    kind: best,
    confidence: Number(confidence.toFixed(2)),
    scores,
    signals: [...new Set(signals)],
  };
}
