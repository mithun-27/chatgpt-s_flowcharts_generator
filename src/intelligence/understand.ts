import type { AiDiagram, AiEdge, AiNode, LayoutDirection, NodeColor, NodeShape, Provenance } from '../types/diagram';
import { splitInlineArrows, stripCodeFences, cleanSourceLine, matchLoopPhrase } from '../utils/flowHeuristics';
import {
  decisionFromCheck,
  detectLoop,
  extractActors,
  extractIo,
  extractSystems,
  extractTitleAndBody,
  firstActionWord,
  hasParallelMarker,
  inferCategory,
  isOtherwiseClause,
  isQualifiedBranch,
  isRejectedBranch,
  normalizeLabelForCompare,
  normalizeWorkflowText,
  parseConditionalClause,
  splitClauses,
  splitParallel,
  splitSentences,
  stepLabel,
  stripMarkdownInline,
  stripOtherwise,
  wordOverlap,
} from './nlp';

export interface UnderstandingResult {
  diagram: AiDiagram;
  objective?: string;
  problem?: string;
  category: string;
  actors: string[];
  systems: string[];
  inputs: string[];
  outputs: string[];
  outcome?: string;
  assumptions: string[];
  questions: string[];
  warnings: string[];
  notes: string[];
}

interface PendingLoop {
  from: string;
  target: string;
  label: string;
}

interface BranchState {
  decision: string;
  yes?: string;
  no?: string;
}

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)]|step\s*\d+\s*[:.)-])\s*/i;
const HEADING = /^\s*#{1,6}\s+/;
const OBJECTIVE_START =
  /^(?:build|create|design|develop|implement|make|launch|generate|set up|plan|automate|architect)\b/i;
const OBJECTIVE_NOUN =
  /\b(?:platform|system|application|app|website|workflow|process|pipeline|tool|service|product|bot|agent|architecture)\b/i;
const EXPLICIT_OBJECTIVE = /^(?:objective|goal|purpose)\s*[:：]\s*(.+)$/i;
const EXPLICIT_PROBLEM = /^(?:problem|pain point|challenge)\s*[:：]\s*(.+)$/i;
const EXPLICIT_OUTCOME = /^(?:expected outcome|outcome|success criteria|result)\s*[:：]\s*(.+)$/i;
const IGNORED_HEADING =
  /^(?:workflow|flow|steps?|process|overview|description|context|inputs?|outputs?|actors?|systems?|requirements?|notes?|details?)\s*[:：]?$/i;
const YES_NO = /^(yes|no|y|n|true|false|if yes|if no)\b\s*[:,-]?\s*(.*)$/i;
const RETRY_WORDS = /\b(retry|retries|repeat|again|allow retry|try again|reattempt)\b/i;

function isObjectiveSentence(value: string): boolean {
  const text = stripMarkdownInline(value).replace(/\s+/g, ' ').trim();
  if (!text || text.length > 220) return false;
  if (!OBJECTIVE_START.test(text) || !OBJECTIVE_NOUN.test(text)) return false;
  // "Build the flow: users sign up, verify email and log in" contains steps.
  if (/[:;]/.test(text)) return false;
  if (/\b(?:then|after that|finally)\b/i.test(text)) return false;
  return true;
}

function titleFromObjective(value: string): string | undefined {
  const cleaned = value
    .replace(OBJECTIVE_START, '')
    .replace(/^(?:an?|the)\s+/i, '')
    .replace(/[.!]+$/, '')
    .trim();
  if (!cleaned) return undefined;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function colorForShape(shape: NodeShape, label = ''): NodeColor {
  if (/error|fail|reject|retry|exception|decline|invalid/i.test(label) && shape !== 'decision') {
    return 'rose';
  }
  switch (shape) {
    case 'startEnd':
      return 'green';
    case 'decision':
      return 'amber';
    case 'inputOutput':
      return 'blue';
    case 'document':
      return 'violet';
    case 'connector':
      return 'slate';
    default:
      return 'slate';
  }
}

function guessShape(label: string): NodeShape {
  const flat = label.replace(/\s+/g, ' ').trim();
  if (!flat) return 'process';
  if (/\?\s*$/.test(flat)) return 'decision';
  if (parseConditionalClause(flat)) return 'decision';
  if (/^(?:start|begin|entry)\b/i.test(flat) || /^(?:end|finish|done|complete|stop|exit)\b/i.test(flat)) {
    return 'startEnd';
  }
  if (/\b(document|report|invoice|receipt|log|record|contract|archive|summary)\b/i.test(flat)) {
    return 'document';
  }
  if (
    /^(?:enter|input|upload|read|receive|get|collect|select|choose|send|show|display|output|print|notify|email|return|provide|submit|present|fetch|download|load|ask|request|confirm)\b/i.test(
      flat,
    )
  ) {
    return 'inputOutput';
  }
  if (/^(?:connector|off[- ]page|jump)\b/i.test(flat)) return 'connector';
  return 'process';
}

function cleanBranchAction(value: string): string {
  const cleaned = stepLabel(
    stripMarkdownInline(value)
      .replace(/^(?:qualified|eligible|approved|valid|verified|successful|accepted|passing)\b[^,;]*?\b(?:proceed|continue|advance|move|go|schedule|interview|next|onward)\b\s*(?:to\s+)?/i, '')
      .replace(/^(?:others|everyone else|remaining|the rest|unqualified|rejected|ineligible|those who (?:do not|don't|cannot))\b\s*(?:will\s+|should\s+)?/i, '')
      .replace(/^(?:then|please)\s+/i, ''),
  );
  const bare = cleaned.replace(/[.!?]+$/, '').trim();
  if (/^interviews?$/i.test(bare)) return 'Proceed to interview';
  if (/\b(receive|send|get)\b.*\brejection\b|\brejection\b.*\bemail\b/i.test(bare)) {
    return 'Send rejection email';
  }
  return bare || cleaned;
}

function retryLabelFor(target: AiNode): string {
  const text = target.label.replace(/\s+/g, ' ').toLowerCase();
  if (/\bpayment\b/.test(text)) return 'Retry payment';
  if (/\bvalidation|validate\b/.test(text)) return 'Retry validation';
  if (/\bupload|file\b/.test(text)) return 'Retry upload';
  if (/\blogin|sign in|credentials\b/.test(text)) return 'Retry sign-in';
  return `Retry ${target.label.split('\n')[0]}`;
}

/**
 * An explicit end is a terminator node, not any step whose label merely starts
 * with a completion verb. "Complete training" is still work; "Order complete"
 * and "End" are true terminators.
 */
function isExplicitEnd(node: AiNode): boolean {
  if (node.shape !== 'startEnd') return false;
  const label = node.label.replace(/\s+/g, ' ').trim();
  if (/^(?:end|finish|done|stop|exit)\b/i.test(label)) return true;
  return /\b(?:complete|completed|done|finished|resolved|closed|end|ended)$/i.test(label);
}

/**
 * ChatGPT answers often wrap a workflow in conversational framing. Those
 * sentences are not workflow steps, so they are removed before parsing.
 */
function stripConversationalFiller(value: string): string {
  return value
    .split('\n')
    .filter((line) => {
      const plain = stripMarkdownInline(line).replace(/[*_`]/g, '').trim();
      if (!plain) return true;
      if (/^(?:sure|certainly|of course|absolutely)[!,.]\s*/i.test(plain)) return false;
      if (
        /^(?:here(?:'s| is)|below is|the following is)\b/i.test(plain) &&
        /\b(?:workflow|flow|process|steps?|diagram)\b/i.test(plain)
      ) {
        return false;
      }
      if (
        /^(?:let me know|would you like|do you want|feel free|i can (?:also|help)|hope (?:this|that) helps|happy to help|tell me if)\b/i.test(
          plain,
        )
      ) {
        return false;
      }
      if (/^if you(?:'d| would) like\b[^.]*\b(?:i can|i could|i'll|i will)\b/i.test(plain)) {
        return false;
      }
      return true;
    })
    .join('\n');
}

function isHeadingLike(value: string): boolean {
  const text = stripMarkdownInline(value).trim();
  if (!text) return true;
  if (IGNORED_HEADING.test(text)) return true;
  if (/^[-=_*]{3,}$/.test(text)) return true;
  return false;
}

function buildUnits(text: string): string[] {
  const lines = stripCodeFences(text).replace(/\r\n/g, '\n').split('\n');
  const units: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const joined = buffer.join(': ').trim();
    if (joined) units.push(joined);
    buffer = [];
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    // Ignore ASCII-flowchart decoration; it carries no workflow semantics.
    if (/^[|+\-—_=<>^v↑↓→←*.·•/\\]{1,}$/i.test(trimmed)) {
      continue;
    }
    if (HEADING.test(trimmed) || isHeadingLike(trimmed)) {
      flush();
      continue;
    }

    const structural =
      LIST_MARKER.test(raw) ||
      YES_NO.test(trimmed) ||
      isOtherwiseClause(trimmed) ||
      /^(?:if|when|unless|otherwise|else)\b/i.test(trimmed) ||
      matchLoopPhrase(trimmed) !== null;

    if (structural) {
      flush();
      units.push(trimmed);
      continue;
    }

    if (buffer.length === 0) {
      buffer.push(trimmed);
      continue;
    }

    const previous = buffer[buffer.length - 1];
    const previousLooksLikeName = /\b(?:agent|assistant|bot|worker|service|module|engine|manager|system|team|pipeline|layer|component)\s*$/i.test(
      previous,
    );
    const currentLooksLikeDescription =
      !firstActionWord(trimmed) ||
      /^[a-z(]/.test(trimmed) ||
      /^[A-Z][a-z]+(?:\s*&\s*[A-Z][a-z]+)+\s*$/i.test(trimmed);

    if (previousLooksLikeName && currentLooksLikeDescription) {
      buffer.push(trimmed);
    } else {
      flush();
      buffer.push(trimmed);
    }
  }
  flush();
  return units;
}

function expandUnits(units: string[]): string[] {
  const expanded: string[] = [];
  for (const unit of units) {
    const withoutMarker = stripMarkdownInline(unit);
    if (!withoutMarker) continue;
    if (/\s(?:→|⇒|⟶|->|-->)\s/.test(withoutMarker)) {
      expanded.push(...splitInlineArrows(withoutMarker).map((part) => cleanSourceLine(part)));
      continue;
    }
    const sentences = splitSentences(withoutMarker);
    for (const sentence of sentences) {
      if (hasParallelMarker(sentence)) {
        const split = sentence.match(
          /^(.*?\b(?:in parallel|simultaneously|at the same time|concurrently|independently)\b.*?)[,;]\s*(?:then\s+|after that\s+|finally\s+)?(.+)$/i,
        );
        if (split) {
          expanded.push(...splitClauses(split[1]));
          expanded.push(...splitClauses(split[2]));
          continue;
        }
      }
      const clauses = splitClauses(sentence);
      expanded.push(...clauses);
    }
  }
  return expanded.filter((unit) => unit.trim().length > 0);
}

function resolveLoopTarget(target: string, nodes: AiNode[], excludeId?: string): AiNode | undefined {
  const value = target.replace(/\s+/g, ' ').trim();
  if (!value) return undefined;
  const byId = nodes.find((node) => node.id === value && node.id !== excludeId);
  if (byId) return byId;
  const stepMatch = value.match(/\b(?:step|steps?)\s*(\d+)\b/i);
  if (stepMatch) {
    const index = Number(stepMatch[1]) - 1;
    return nodes[index];
  }

  const candidates = nodes.filter((node) => node.id !== excludeId);
  const exact = candidates.find(
    (node) => normalizeLabelForCompare(node.label) === normalizeLabelForCompare(value),
  );
  if (exact) return exact;

  return candidates
    .map((node) => ({ node, score: wordOverlap(node.label, value) }))
    .filter((item) => item.score >= 0.4)
    .sort((a, b) => b.score - a.score)[0]?.node;
}

function decisionLabelFromCheck(value: string): string | null {
  return decisionFromCheck(value);
}

/**
 * Deterministic workflow understanding. It converts prose into an explicit
 * graph with decisions, branches, merges, loops and parallel paths. It is the
 * fallback when no AI model is configured, and also the pre-processing layer
 * that gives the AI a structural hint.
 */
export function understandWorkflow(
  text: string,
  direction: LayoutDirection = 'TB',
): UnderstandingResult {
  const normalized = normalizeWorkflowText(text);
  if (!normalized.trim()) {
    throw new Error('Paste a workflow with at least one step.');
  }

  const titled = extractTitleAndBody(normalized);
  const body = stripConversationalFiller(titled.body.trim() || normalized);
  const nodes: AiNode[] = [];
  const edges: AiEdge[] = [];
  const edgeKeys = new Set<string>();
  const pendingLoops: PendingLoop[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const assumptions: string[] = [];
  const questions: string[] = [];

  let objective: string | undefined;
  let problem: string | undefined;
  let outcome: string | undefined;

  let previous: string | null = null;
  let lastDecision: string | null = null;
  let awaiting: 'yes' | 'no' | null = null;
  let branches: BranchState | null = null;
  let mergeTails: string[] = [];
  let parallelTails: string[] = [];
  let pendingCheck: { id: string; decision: string; label: string } | null = null;

  const nodeById = (id: string | null): AiNode | undefined =>
    id ? nodes.find((node) => node.id === id) : undefined;

  const addNode = (
    requestLabel: string,
    options: {
      shape?: NodeShape;
      provenance?: Provenance;
      rationale?: string;
      confidence?: number;
      color?: NodeColor;
    } = {},
  ): string => {
    const label = cleanSourceLine(requestLabel) || 'Step';
    const shape = options.shape ?? guessShape(label);
    const id = `u-${nodes.length + 1}`;
    nodes.push({
      id,
      label,
      shape,
      color: options.color ?? colorForShape(shape, label),
      provenance: options.provenance ?? 'explicit',
      confidence: options.confidence ?? (options.provenance === 'inferred' ? 0.68 : 0.92),
      ...(options.rationale ? { rationale: options.rationale } : {}),
    });
    return id;
  };

  const connect = (
    source: string | null | undefined,
    target: string | null | undefined,
    label?: string,
    provenance: Provenance = 'explicit',
  ) => {
    if (!source || !target || source === target) return;
    const clean = label ? stepLabel(label) : '';
    const key = `${source}|${target}|${clean}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      source,
      target,
      ...(clean ? { label: clean } : {}),
      ...(provenance === 'inferred' ? { provenance: 'inferred' } : {}),
    } as AiEdge);
  };

  /**
   * Adds one logical action that may contain several independently meaningful
   * clauses, for example "save the form and show a confirmation".
   */
  const addActionChain = (
    raw: string,
    options: {
      provenance?: Provenance;
      rationale?: string;
      color?: NodeColor;
    } = {},
  ): { first: string; last: string } | null => {
    const parts = splitClauses(stripMarkdownInline(raw))
      .map((part) => cleanBranchAction(part))
      .filter(Boolean);
    const labels = parts.length > 0 ? parts : [cleanBranchAction(raw)].filter(Boolean);
    if (labels.length === 0) return null;

    let first = '';
    let last = '';
    for (const label of labels) {
      const id = addNode(label, options);
      if (!first) first = id;
      if (last) connect(last, id, undefined, 'inferred');
      last = id;
    }
    return { first, last };
  };

  const setBranchTail = (kind: 'yes' | 'no', id: string) => {
    if (!lastDecision) return;
    if (!branches || branches.decision !== lastDecision) branches = { decision: lastDecision };
    branches[kind] = id;
    if (branches.yes && branches.no && branches.yes !== branches.no) {
      mergeTails = [branches.yes, branches.no];
    }
  };

  const connectEntry = (target: string) => {
    if (parallelTails.length > 0) {
      for (const tail of parallelTails) connect(tail, target, undefined, 'inferred');
      parallelTails = [];
      return;
    }
    if (mergeTails.length > 0) {
      for (const tail of mergeTails) connect(tail, target, undefined, 'inferred');
      mergeTails = [];
      return;
    }
    if (previous) connect(previous, target);
  };

  const beginDecision = (label: string, rationale: string): string => {
    const id = addNode(label, {
      shape: 'decision',
      provenance: 'inferred',
      rationale,
      confidence: 0.8,
    });
    connectEntry(id);
    lastDecision = id;
    awaiting = 'yes';
    branches = { decision: id };
    mergeTails = [];
    parallelTails = [];
    previous = id;
    return id;
  };

  /**
   * A sentence such as "The system checks qualifications" is first kept as a
   * normal step. If the next sentence is a qualified/rejected branch or a raw
   * Yes/No line, the check becomes the decision that branch depends on.
   */
  const promotePendingCheck = (): boolean => {
    if (!pendingCheck) return false;
    const node = nodeById(pendingCheck.id);
    if (!node?.id) {
      pendingCheck = null;
      return false;
    }
    node.shape = 'decision';
    node.color = 'amber';
    node.label = pendingCheck.decision;
    node.provenance = 'inferred';
    node.rationale =
      'A verification step was promoted to a decision because the following branch depends on its result.';
    lastDecision = node.id;
    awaiting = 'yes';
    branches = { decision: node.id };
    previous = node.id;
    notes.push(
      `Check “${pendingCheck.label}” interpreted as decision “${pendingCheck.decision}”.`,
    );
    pendingCheck = null;
    return true;
  };

  const removeEdge = (source: string, target: string) => {
    for (let index = edges.length - 1; index >= 0; index -= 1) {
      const edge = edges[index];
      if (edge.source !== source || edge.target !== target) continue;
      edgeKeys.delete(`${edge.source}|${edge.target}|${edge.label ?? ''}`);
      edges.splice(index, 1);
    }
  };

  const insertDecisionBefore = (target: string, label: string, rationale: string): string => {
    const incoming = edges.filter((edge) => edge.target === target);
    for (const edge of incoming) removeEdge(edge.source, edge.target);
    const id = addNode(label, {
      shape: 'decision',
      provenance: 'inferred',
      rationale,
      confidence: 0.8,
    });
    for (const edge of incoming) connect(edge.source, id, edge.label);
    connect(id, target, 'Yes', 'inferred');
    lastDecision = id;
    awaiting = 'no';
    branches = { decision: id, yes: target };
    mergeTails = [target];
    parallelTails = [];
    previous = target;
    return id;
  };

  const handleConditional = (raw: string) => {
    const parsed = parseConditionalClause(raw);
    if (!parsed) return false;
    // A preceding verification step stays visible; the conditional supplies the decision.
    pendingCheck = null;

    const previousDecision = nodeById(lastDecision);
    const reusable =
      Boolean(previousDecision) &&
      Boolean(lastDecision) &&
      branches?.decision === lastDecision &&
      !branches?.yes &&
      (wordOverlap(previousDecision?.label ?? '', parsed.condition) >= 0.34 ||
        /^(?:it\s+)?(?:is\s+)?(?:valid|successful|approved|eligible|available|correct|okay|passed|yes)$/i.test(
          parsed.condition,
        ));

    const referenced =
      !reusable && awaiting === null && previous
        ? nodes
            .filter(
              (node) =>
                node.id !== previous &&
                (node.id as string | undefined) !== lastDecision &&
                node.shape !== 'startEnd' &&
                node.shape !== 'decision',
            )
            .map((node) => ({ node, score: wordOverlap(node.label, parsed.condition) }))
            .filter((item) => item.score >= (parsed.yes ? 0.75 : 0.45))
            .sort((left, right) => right.score - left.score)[0]?.node
        : undefined;

    const insertedBefore = Boolean(referenced && previous);
    const targetLabel = nodeById(previous)?.label;

    let decisionId: string;
    if (reusable) {
      decisionId = lastDecision!;
      notes.push(
        `Conditional “${parsed.condition}” reuses the preceding decision “${previousDecision?.label ?? ''}”.`,
      );
    } else if (insertedBefore && previous) {
      decisionId = insertDecisionBefore(
        previous,
        parsed.decision,
        `Conditional “${parsed.condition}” refers back to “${referenced?.label ?? ''}”.`,
      );
      notes.push(
        `Conditional “${parsed.condition}” inserted before “${targetLabel ?? ''}” so the earlier path stays on Yes.`,
      );
    } else {
      decisionId = beginDecision(parsed.decision, 'Derived from a conditional expression.');
      notes.push(`Conditional “${parsed.condition}” interpreted as the decision “${parsed.decision}”.`);
    }

    let yesId: string | undefined;
    let noId: string | undefined;

    if (parsed.yes) {
      const chain = addActionChain(parsed.yes, {
        provenance: 'explicit',
        rationale: 'Classified as the positive branch of the conditional.',
      });
      if (chain) {
        connect(decisionId, chain.first, 'Yes');
        yesId = chain.last;
      }
    }
    if (parsed.no) {
      const chain = addActionChain(parsed.no, {
        provenance: 'explicit',
        rationale: 'Classified as the negative branch of the conditional.',
      });
      if (chain) {
        connect(decisionId, chain.first, 'No');
        noId = chain.last;
      }
    }

    if (parsed.polarity === 'negative') {
      // "If payment fails, allow retry" means the No branch retries a step.
      const retryText = [parsed.no, parsed.yes].find((value) => value && RETRY_WORDS.test(value));
      if (retryText) {
        const target = resolveLoopTarget(
          parsed.condition.replace(/\b(?:fails?|failed|failure|invalid|not\s+)/gi, ''),
          nodes,
          decisionId,
        );
        if (target) {
          let retryId = noId;
          if (!retryId) {
            retryId = addNode(retryLabelFor(target), {
              shape: 'process',
              color: 'rose',
              provenance: 'inferred',
              rationale: `Retry path inferred from “${raw}”.`,
              confidence: 0.7,
            });
            connect(decisionId, retryId, 'No');
          } else {
            const node = nodeById(retryId);
            if (node && /^(?:allow|try)\s+retry$/i.test(node.label.replace(/[.!?]+$/, ''))) {
              node.label = retryLabelFor(target);
            }
          }
          pendingLoops.push({ from: retryId, target: target.id ?? target.label, label: 'Retry' });
          notes.push(`Retry path loops back to “${target.label}”.`);
          noId = retryId;
        }
      }
    }

    if (yesId && noId) {
      branches = { decision: decisionId, yes: yesId, no: noId };
      mergeTails = [yesId, noId];
      awaiting = null;
      previous = noId;
    } else if (yesId) {
      branches = { decision: decisionId, yes: yesId };
      awaiting = 'no';
      previous = yesId;
    } else if (noId) {
      const existingYes = branches?.decision === decisionId ? branches.yes : undefined;
      branches = { decision: decisionId, ...(existingYes ? { yes: existingYes } : {}), no: noId };
      mergeTails = existingYes ? [existingYes] : [];
      awaiting = existingYes ? null : 'yes';
      previous = noId;
    } else {
      awaiting = 'yes';
      previous = decisionId;
    }
    return true;
  };

  const handleBranchLine = (kind: 'yes' | 'no', rest: string) => {
    if (!lastDecision) promotePendingCheck();
    if (!lastDecision) {
      if (rest.trim()) addPlainStep(rest);
      return;
    }
    if (!rest.trim()) {
      awaiting = kind;
      return;
    }
    const chain = addActionChain(rest);
    if (!chain) return;
    const id = chain.last;
    connect(lastDecision, chain.first, kind === 'yes' ? 'Yes' : 'No');
    if (kind === 'no' && RETRY_WORDS.test(rest)) {
      const decisionNode = nodeById(lastDecision);
      const retryNode = nodeById(id);
      if (decisionNode && retryNode) {
        retryNode.label = retryLabelFor(decisionNode);
        pendingLoops.push({ from: id, target: lastDecision, label: 'Retry' });
        notes.push(`Retry path loops back to “${decisionNode.label}”.`);
      }
    }
    setBranchTail(kind, id);
    awaiting = null;
    previous = id;
  };

  const handleQualified = (raw: string) => {
    if (!lastDecision) promotePendingCheck();
    if (!lastDecision) return false;
    const chain = addActionChain(raw, {
      provenance: 'explicit',
      rationale: 'Classified as the positive branch of the preceding check.',
    });
    if (!chain) return false;
    connect(lastDecision, chain.first, 'Yes');
    setBranchTail('yes', chain.last);
    awaiting = branches?.no ? null : 'no';
    previous = chain.last;
    return true;
  };

  const handleRejected = (raw: string) => {
    if (!lastDecision) promotePendingCheck();
    if (!lastDecision) return false;
    const chain = addActionChain(raw, {
      provenance: 'explicit',
      rationale: 'Classified as the negative branch of the preceding check.',
      color: 'rose',
    });
    const label = cleanBranchAction(raw) || 'Handle rejection';
    const id = chain ? chain.last : addNode(label, {
      provenance: 'explicit',
      rationale: 'Classified as the negative branch of the preceding check.',
      color: 'rose',
    });
    connect(lastDecision, chain?.first ?? id, 'No');
    setBranchTail('no', id);
    awaiting = branches?.yes ? null : 'yes';
    previous = id;
    return true;
  };

  const handleLoop = (raw: string) => {
    const loop = detectLoop(raw);
    if (!loop) return false;
    pendingCheck = null;
    let from = previous;
    const prefix = cleanSourceLine(loop.prefix);
    if (prefix && !/^(?:then|and|finally|next)$/i.test(prefix)) {
      const current = nodeById(previous);
      const prefixKey = normalizeLabelForCompare(prefix);
      const sameNode =
        Boolean(current) &&
        (normalizeLabelForCompare(current!.label) === prefixKey ||
          normalizeLabelForCompare(current!.label).includes(prefixKey) ||
          wordOverlap(current!.label, prefix) >= 0.5);
      if (!sameNode) {
        from = addNode(prefix);
        connectEntry(from);
      }
    }
    if (from) {
      mergeTails = mergeTails.filter((tail) => tail !== from);
      parallelTails = parallelTails.filter((tail) => tail !== from);
      pendingLoops.push({
        from,
        target: loop.target,
        label: /retry|repeat|again/i.test(raw) ? 'Retry' : 'Again',
      });
      previous = from;
      notes.push(`Feedback loop “${from}” → “${loop.target}” preserved instead of forcing a DAG.`);
    }
    return true;
  };

  function addPlainStep(raw: string) {
    const label = stepLabel(raw);
    if (!label) return;

    if (/\?\s*$/.test(label) || /^(?:is|are|does|do|can|should|has|have|was|were)\b/i.test(label)) {
      pendingCheck = null;
      const decisionId = beginDecision(label.endsWith('?') ? label : `${label}?`, 'A question was promoted to a decision node.');
      previous = decisionId;
      return;
    }

    const checkDecision = decisionLabelFromCheck(label);
    const shape = guessShape(label);
    const id = addNode(label, { shape });

    if (awaiting && lastDecision) {
      connect(lastDecision, id, awaiting === 'yes' ? 'Yes' : 'No');
      setBranchTail(awaiting, id);
      awaiting = null;
      previous = id;
      pendingCheck = checkDecision ? { id, decision: checkDecision, label } : null;
      return;
    }

    connectEntry(id);
    previous = id;
    pendingCheck = checkDecision ? { id, decision: checkDecision, label } : null;
  }

  const units = expandUnits(buildUnits(body));
  for (const unit of units) {
    const flat = stripMarkdownInline(unit).replace(/\s+/g, ' ').trim();
    if (!flat) continue;

    const explicitObjective = flat.match(EXPLICIT_OBJECTIVE);
    if (explicitObjective) {
      objective = stepLabel(explicitObjective[1]);
      continue;
    }
    const explicitProblem = flat.match(EXPLICIT_PROBLEM);
    if (explicitProblem) {
      problem = stepLabel(explicitProblem[1]);
      continue;
    }
    const explicitOutcome = flat.match(EXPLICIT_OUTCOME);
    if (explicitOutcome) {
      outcome = stepLabel(explicitOutcome[1]);
      continue;
    }
    if (isObjectiveSentence(flat)) {
      objective = objective ?? stepLabel(flat);
      continue;
    }
    if (IGNORED_HEADING.test(flat)) continue;

    const branch = flat.match(YES_NO);
    if (branch) {
      const kind: 'yes' | 'no' = /^(?:yes|y|true|if yes)$/i.test(branch[1]) ? 'yes' : 'no';
      handleBranchLine(kind, branch[2] ?? '');
      continue;
    }

    if (isOtherwiseClause(flat)) {
      handleBranchLine('no', stripOtherwise(flat));
      continue;
    }

    if (hasParallelMarker(flat)) {
      const parts = splitParallel(flat);
      if (parts.length >= 2) {
        pendingCheck = null;
        const ids = parts.map((part) => {
          const id = addNode(stepLabel(part));
          return id;
        });
        for (const id of ids) connectEntry(id);
        parallelTails = ids;
        previous = null;
        notes.push(`Parallel execution recognised (${ids.length} concurrent steps).`);
        continue;
      }
    }

    if (handleConditional(flat)) continue;

    if (handleLoop(flat)) continue;

    if (isQualifiedBranch(flat) && handleQualified(flat)) continue;
    if (isRejectedBranch(flat) && handleRejected(flat)) continue;

    // "If valid, process data" already handled. A bare "If valid" becomes a
    // decision whose branches are filled by the following Yes/No units.
    if (/^(?:if|when|unless)\b/i.test(flat)) {
      const condition = flat.replace(/^(?:if|when|unless)\b\s*/i, '').replace(/[.!]+$/, '').trim();
      if (condition) {
        pendingCheck = null;
        beginDecision(
          condition.endsWith('?') ? condition : `${condition.charAt(0).toUpperCase()}${condition.slice(1)}?`,
          'A bare condition was promoted to a decision node.',
        );
        continue;
      }
    }

    addPlainStep(flat);
  }

  // Resolve loops after all nodes exist so "go back to step 2" and fuzzy
  // references can point at the right node.
  for (const loop of pendingLoops) {
    const source = nodeById(loop.from);
    const target = resolveLoopTarget(loop.target, nodes, loop.from);
    if (!target?.id) {
      warnings.push(`Could not resolve the loop target “${loop.target}”.`);
      continue;
    }
    if (source?.id === target.id) {
      warnings.push(`Ignored a self-loop on “${source.label}”.`);
      continue;
    }
    connect(source?.id, target.id, loop.label, 'inferred');
  }

  if (nodes.length === 0) {
    throw new Error('Could not find any workflow steps in that text.');
  }

  // Add explicit Start/End terminators when the narrative does not provide them.
  const first = nodes[0];
  if (first && first.shape !== 'startEnd' && first.shape !== 'inputOutput') {
    const startId = 'u-start';
    const entryNodes = nodes.filter(
      (node) => node.id && !edges.some((edge) => edge.target === node.id),
    );
    nodes.unshift({
      id: startId,
      label: 'Start',
      shape: 'startEnd',
      color: 'green',
      provenance: 'inferred',
      confidence: 0.9,
      rationale: 'Entry terminator added for a readable flowchart.',
    });
    for (const entry of entryNodes) {
      connect(startId, entry.id ?? '', undefined, 'inferred');
    }
    assumptions.push('Added a Start terminator because the input had no explicit entry point.');
  }

  const outgoing = new Set(edges.map((edge) => edge.source));
  const exits = nodes.filter((node) => node.id && !outgoing.has(node.id));
  const hasExplicitEnd = exits.some((node) => isExplicitEnd(node));

  if (!hasExplicitEnd) {
    const endId = 'u-end';
    nodes.push({
      id: endId,
      label: 'End',
      shape: 'startEnd',
      color: 'green',
      provenance: 'inferred',
      confidence: 0.9,
      rationale: 'Exit terminator added so every path has a visible end.',
    });
    for (const exitNode of exits) {
      if (!exitNode.id || exitNode.id === endId) continue;
      const label =
        exitNode.shape === 'decision'
          ? awaiting === 'no'
            ? 'No'
            : 'Yes'
          : undefined;
      connect(exitNode.id, endId, label, 'inferred');
    }
    assumptions.push('Added an End terminator and connected the remaining open paths to it.');
  } else if (awaiting && lastDecision) {
    const endNode = exits.find((node) => /^(?:end|finish|done|complete|stop|exit)\b/i.test(node.label));
    if (endNode?.id) {
      connect(lastDecision, endNode.id, awaiting === 'yes' ? 'Yes' : 'No', 'inferred');
    }
  }

  const cleanedNodes = nodes.map((node) => {
    const label = node.label.replace(/\s+/g, ' ').trim();
    return { ...node, label };
  });

  const lastMeaningful = [...cleanedNodes]
    .reverse()
    .find((node) => node.shape !== 'startEnd' && node.label !== 'End');
  const inferredOutcome = lastMeaningful?.label;

  const category = inferCategory(body);
  const actors = extractActors(body);
  const systems = extractSystems(body);
  const io = extractIo(body);

  if (!objective) {
    questions.push('What is the main objective or desired outcome of this workflow?');
  }
  if (cleanedNodes.length <= 4) {
    questions.push('Are there any exception paths or hand-offs that were not mentioned?');
  }
  if (/\b(?:some|various|etc\.?|appropriate|as needed|maybe|possibly)\b/i.test(body)) {
    questions.push('Some details were vague. Should those optional steps be split into explicit branches?');
  }
  if (edges.length === 0) {
    warnings.push('The workflow was understood but no relationships could be inferred.');
  }

  const finalAssumptions = [...new Set(assumptions)];
  const allWarnings = [...new Set(warnings)];
  return {
    diagram: {
      direction,
      title: titled.title ?? (objective ? titleFromObjective(objective) : undefined),
      nodes: cleanedNodes,
      edges,
    },
    ...(objective ? { objective } : {}),
    ...(problem ? { problem } : {}),
    category,
    actors,
    systems,
    inputs: io.inputs,
    outputs: io.outputs,
    outcome: outcome ?? inferredOutcome,
    assumptions: finalAssumptions,
    questions: [...new Set(questions)].slice(0, 4),
    warnings: allWarnings,
    notes: [...new Set(notes)],
  };
}
