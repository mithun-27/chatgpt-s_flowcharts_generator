import type { LayoutDirection, NodeShape } from '../types/diagram';

const START_WORDS =
  /^(start|begin|beginning|entry|kick off|trigger|launch|initiate|open)\b/i;
const END_WORDS =
  /^(end|finish|finished|done|complete|completed|close|closed|resolve|resolved|stop|terminate|terminated|exit|halt)\b/i;
const IO_START_WORDS =
  /^(enter|input|upload|read|receive|get|collect|select|choose|send|show|display|output|print|notify|email|return|provide|submit|present|fetch|download|load|prompt|ask)\b/i;
const DECISION_START_WORDS =
  /^(if|whether|is|are|does|do|can|could|has|have|should|check if|check whether|decide|determine whether|verify whether)\b/i;
const DOCUMENT_WORDS =
  /\b(document|report|invoice|receipt|log|record|letter|contract|form|archive|spreadsheet|summary)\b/i;

const BRANCH_YES = /\b(yes|y|true|ok|okay|approved|valid|success|successful|accepted|allowed|confirmed)\b/i;
const BRANCH_NO =
  /\b(no|n|false|cancel|rejected|invalid|failure|failed|declined|denied|error|not approved)\b/i;

const PURE_BRANCH =
  /^(yes|no|y|n|true|false|ok|okay|cancel|approved|rejected|valid|invalid|success|successful|failure|failed|accepted|declined|allowed|denied)$/i;

const LOOP_PHRASE =
  /\b(go(?:es)?\s+back\s+to|loop\s+back\s+to|loop\s+to|return\s+to|jump\s+back\s+to|jump\s+to|back\s+to|repeat\s+from|start\s+over\s+(?:at|from)|retry\s+(?:from|at))\b/i;

export function cleanSourceLine(raw: string): string {
  return raw
    .replace(/^\s*(?:[-*•]|\d+[.)]|step\s*\d+\s*[:.)-]?)\s*/i, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*(?:then|next|after that|finally)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/, '')
    .trim();
}

export function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function detectShape(label: string): NodeShape {
  const value = label.replace(/\r/g, '').trim();
  if (!value) return 'process';
  const firstLine = (value.split('\n')[0] ?? '').trim();
  const flat = value.replace(/\s+/g, ' ').trim();

  if (
    /[?]\s*$/.test(flat) ||
    DECISION_START_WORDS.test(firstLine) ||
    /^(decision|branch|gate|gateway)\b/i.test(firstLine)
  ) {
    return 'decision';
  }

  if (END_WORDS.test(firstLine) || START_WORDS.test(firstLine)) {
    return 'startEnd';
  }

  if (
    IO_START_WORDS.test(firstLine) ||
    /\b(user input|input data|data input|output data|final output)\b/i.test(flat) ||
    /\b(input|output)\s*$/i.test(flat)
  ) {
    return 'inputOutput';
  }

  if (DOCUMENT_WORDS.test(flat)) {
    return 'document';
  }

  if (/^(connector|off[- ]page|jump)\b/i.test(firstLine)) {
    return 'connector';
  }

  return 'process';
}

export function decisionLabel(condition: string): string {
  let label = condition
    .replace(/^(?:if|when|whether|check\s+(?:if|whether)|decide\s+whether|determine\s+whether)\s+/i, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/[?]+$/g, '')
    .replace(/[.;,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!label) return 'Decision?';
  label = capitalizeFirst(label);
  return label.endsWith('?') ? label : `${label}?`;
}

export function isPureBranchLabel(value: string): boolean {
  return PURE_BRANCH.test(value.replace(/[.:;!]+$/, '').trim());
}

export function branchKind(value: string): 'yes' | 'no' | null {
  const text = value.replace(/[.:;!]+$/, '').trim();
  if (!text) return null;
  if (/^(yes|y|true|ok|okay)$/i.test(text)) return 'yes';
  if (/^(no|n|false|cancel)$/i.test(text)) return 'no';
  if (BRANCH_YES.test(text) && !BRANCH_NO.test(text)) return 'yes';
  if (BRANCH_NO.test(text)) return 'no';
  return null;
}

/** Matches "go back to X", "loop to X", "repeat from X" and similar. */
export function matchLoopPhrase(value: string): { prefix: string; target: string } | null {
  const match = value.match(
    /^(.*?)\b(?:go(?:es)?\s+back\s+to|loop\s+back\s+to|loop\s+to|return\s+to|jump\s+back\s+to|jump\s+to|back\s+to|repeat\s+from|start\s+over\s+(?:at|from)|retry\s+(?:from|at))\s+(.+)$/i,
  );
  if (!match) return null;
  const prefix = cleanSourceLine(match[1] ?? '');
  const target = cleanSourceLine(match[2] ?? '');
  if (!target) return null;
  return { prefix, target };
}

export function isLoopPhrase(value: string): boolean {
  return LOOP_PHRASE.test(value) && matchLoopPhrase(value) !== null;
}

const ARROW_SPLIT = /\s*(?:-{1,}>|={1,}>|→|⇒|➔|➜|⟶|↦|--+>|==+>)\s*/;

export function hasInlineArrow(value: string): boolean {
  return ARROW_SPLIT.test(value);
}

export function splitInlineArrows(value: string): string[] {
  return value
    .split(ARROW_SPLIT)
    .map((part) => cleanSourceLine(part))
    .filter(Boolean);
}

export function stripCodeFences(value: string): string {
  return value
    .replace(/```[a-z0-9_-]*\s*\n?/gi, '')
    .replace(/```/g, '');
}

export interface TitleExtraction {
  title?: string;
  body: string;
}

/**
 * Pulls an explicit title out of the pasted text. A first line is only treated
 * as a title when it is clearly labelled as one, or when it is a short heading
 * followed by a blank line and contains a title-like word. This keeps ordinary
 * first steps from disappearing.
 */
export function extractTitle(value: string): TitleExtraction {
  const lines = stripCodeFences(value).replace(/\r\n/g, '\n').split('\n');
  let firstContent = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim()) {
      firstContent = i;
      break;
    }
  }
  if (firstContent < 0) return { body: value };

  const line = lines[firstContent].trim();
  const explicit =
    line.match(/^#{1,6}\s+(.+)$/) ??
    line.match(/^\*{0,2}(?:flowchart\s+|diagram\s+)?title\*{0,2}\s*[:\-]\s*(.+)$/i);

  if (explicit) {
    const title = cleanSourceLine(explicit[1]);
    lines.splice(firstContent, 1);
    return { title: title || undefined, body: lines.join('\n') };
  }

  const nextIsBlank = lines[firstContent + 1] !== undefined && !lines[firstContent + 1].trim();
  const hasMore = lines.slice(firstContent + 1).some((item) => item.trim());
  const looksLikeHeading =
    line.length <= 70 &&
    !/[.!?;]$/.test(line) &&
    !/^\s*(?:[-*•]|\d+[.)])/.test(line) &&
    !/\b(?:then|next)\b/i.test(line) &&
    (/\b(workflow|process|flow|diagram|pipeline|architecture|system|journey)\b/i.test(line) ||
      line
        .split(/\s+/)
        .filter((word) => /^[A-Za-z]/.test(word))
        .every((word) => /^[A-Z]/.test(word) || /^(?:of|and|the|for|to|in|a|an)$/i.test(word)));

  if (nextIsBlank && hasMore && looksLikeHeading) {
    lines.splice(firstContent, 1);
    return { title: cleanSourceLine(line) || undefined, body: lines.join('\n') };
  }

  return { body: value };
}

export function normalizeDirection(value: unknown): LayoutDirection {
  return value === 'LR' || value === 'BT' || value === 'RL' ? value : 'TB';
}
