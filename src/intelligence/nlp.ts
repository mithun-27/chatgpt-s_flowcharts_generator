import { decisionLabel, extractTitle, matchLoopPhrase, splitInlineArrows, stripCodeFences } from '../utils/flowHeuristics';

const ACTION_VERBS = new Set(
  `accept access add adjust advance alert align allow analyze analyse answer apply approve archive assess assign attach audit authenticate authorize begin book build calculate call cancel capture categorize change check classify clean close collect commit compare compile complete compose compute confirm connect continue convert create decide decline define delete deliver deploy describe design detect determine develop display distribute download draft edit email enable encrypt end enter escalate evaluate execute expand export extract fail fetch filter finalize find finish flag follow forward generate get grant group handle import improve include initialize input inspect install interview invite issue join label launch load log make manage map mark merge migrate monitor move notify open optimize order organize output parse pass pay perform place plan post prepare present print process produce prompt publish pull push qualify query queue read receive record recover redirect reduce refund reject release remove render renew repeat replace report request require reserve reset resolve respond restart restore resume retrieve retry return review revoke roll run save scan schedule score search select send separate set share show sign simplify skip sort split start stop store submit suggest summarize sync tag test track transform trigger update upload validate verify view wait warn write choose pick browse click tap type fill ask`.split(
    /\s+/,
  ),
);

const ACTOR_PATTERN =
  /^(?:the\s+|a\s+|an\s+)?((?:patient|user|customer|admin|administrator|system|agent|assistant|bot|worker|manager|employee|reviewer|operator|developer|client|service|server|application|platform|doctor|nurse|student|teacher|candidate|recruiter|finance|support|sales|orchestrator|planner|executor)s?)\b/i;

const NEGATIVE_CONDITION =
  /\b(fail|fails|failed|failure|invalid|rejected|declined|denied|error|errors|unavailable|missing|not\s+\w+|cannot|can't|isn't|doesn't|does not|not approved|not valid|not eligible|unsuccessful)\b/i;

const NEGATIVE_PAIRS: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /\b(fails|failed|failure)\b/i, replace: 'succeeds' },
  { pattern: /\bis\s+invalid\b/i, replace: 'is valid' },
  { pattern: /\bnot\s+approved\b/i, replace: 'approved' },
  { pattern: /\bnot\s+valid\b/i, replace: 'valid' },
  { pattern: /\bnot\s+eligible\b/i, replace: 'eligible' },
  { pattern: /\b(rejected|declined|denied)\b/i, replace: 'accepted' },
  { pattern: /\b(error|errors|failure)\b/i, replace: 'success' },
  { pattern: /\bunavailable\b/i, replace: 'available' },
  { pattern: /\bmissing\b/i, replace: 'present' },
  { pattern: /\bcannot\b|\bcan't\b/i, replace: 'can' },
];

const CATEGORY_RULES: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Healthcare', pattern: /\b(patient|doctor|clinic|hospital|appointment|medical|prescription|health)\b/i },
  { category: 'Recruitment', pattern: /\b(resume|cv|candidate|interview|recruit|hiring|applicant|job)\b/i },
  { category: 'Customer support', pattern: /\b(ticket|support|helpdesk|agent|escalat|customer issue)\b/i },
  { category: 'E-commerce & payments', pattern: /\b(order|cart|checkout|payment|refund|invoice|product|shipping|delivery)\b/i },
  { category: 'Onboarding & authentication', pattern: /\b(sign ?up|register|login|sign ?in|onboard|verify email|password|credential)\b/i },
  { category: 'Data & document processing', pattern: /\b(upload|document|extract|parse|report|archive|file|data pipeline|etl)\b/i },
  { category: 'AI agent orchestration', pattern: /\b(agent|orchestrator|planner|executor|tool|llm|rag|memory|multi[- ]agent)\b/i },
  { category: 'Software architecture', pattern: /\b(architecture|service|database|queue|api|gateway|cache|deploy|microservice)\b/i },
  { category: 'Business operations', pattern: /\b(approval|procurement|inventory|department|employee|sla|kpi|finance)\b/i },
];

const SYSTEM_WORDS =
  /\b(system|service|server|database|api|gateway|queue|cache|platform|application|app|webhook|model|llm|agent|worker|orchestrator|payment provider|email service)\b/gi;

const INPUT_PATTERN =
  /\b(?:upload|enter|input|submit|provide|receive|get|collect|select|choose|attach|paste|fill)\b(?:\s+\w+){0,4}/gi;
const OUTPUT_PATTERN =
  /\b(?:send|return|display|show|notify|email|generate|produce|respond|confirm|grant|publish|print|export|issue)\b(?:\s+\w+){0,4}/gi;

export interface ConditionalParts {
  condition: string;
  decision: string;
  yes?: string;
  no?: string;
  polarity: 'positive' | 'negative';
}

export function normalizeWorkflowText(value: string): string {
  return stripCodeFences(value)
    .replace(/\r\n/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripMarkdownInline(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*(?:\d+[.)]|step\s*\d+\s*[:.)-]|[-*•])\s*/i, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function splitSentences(text: string): string[] {
  const value = normalizeWorkflowText(text);
  const protectedText = value
    .replace(/\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|no|fig|approx)\./gi, (_match, token: string) =>
      `${token}__DOT__`,
    )
    .replace(/\b(\d+)\.(\d+)/g, '$1__DOT__$2');

  return protectedText
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((sentence) => sentence.replace(/__DOT__/g, '.').trim())
    .filter((sentence) => sentence.length > 1)
    .filter((sentence) => !/^[-=_*]{3,}$/.test(sentence));
}

export function firstActionWord(value: string): string | null {
  const cleaned = stripMarkdownInline(value)
    .replace(ACTOR_PATTERN, '')
    .replace(/^(?:then|next|after that|finally|also|and)\s+/i, '');
  const match = cleaned.match(/^([A-Za-z][A-Za-z'-]*)/);
  if (!match) return null;
  const word = match[1].toLowerCase();
  if (ACTION_VERBS.has(word)) return word;
  const stem = word.replace(/(?:s|es|ed|ing)$/i, '');
  return ACTION_VERBS.has(stem) ? stem : null;
}

export function startsWithAction(value: string): boolean {
  return firstActionWord(value) !== null;
}

export function splitClauses(sentence: string): string[] {
  const value = stripMarkdownInline(sentence)
    .replace(/\bthen\s+/gi, '')
    .replace(/\band then\s+/gi, '')
    .trim();
  if (!value) return [];
  if (parseConditionalClause(value) || /\b(otherwise|else)\b/i.test(value)) return [value];
  if (hasParallelMarker(value)) return [value];

  const splitConjunction = (chunk: string): string[] => {
    const pieces = chunk.split(/\s+and\s+/i);
    if (pieces.length <= 1) return [chunk];
    const result: string[] = [];
    for (const piece of pieces) {
      const previous = result[result.length - 1];
      if (!previous) {
        result.push(piece);
        continue;
      }
      // A single-word lead-in such as "Resolve and close the ticket" is one
      // compound action, not two independently meaningful steps.
      const previousIsStep = previous.trim().split(/\s+/).length >= 2;
      const pieceIsStep = piece.trim().split(/\s+/).length >= 2;
      const pieceHasVerb =
        startsWithAction(piece) ||
        ACTOR_PATTERN.test(piece) ||
        /\b(?:is|are|was|were|be|been|being|has|have|had|will|would|should|can|could|may|might|must|gets?|got|becomes?|remains?)\b/i.test(
          piece,
        );
      if (pieceHasVerb && previousIsStep && pieceIsStep) {
        result.push(piece);
      } else {
        result[result.length - 1] = `${previous} and ${piece}`;
      }
    }
    return result;
  };

  const parts = value
    .split(/;|\s+-\s+|\s+—\s+/)
    .flatMap((part) => {
      const chunks = part.split(/,\s*(?:and\s+)?/i);
      if (chunks.length <= 1) return splitConjunction(part);
      const result: string[] = [chunks[0]];
      for (const chunk of chunks.slice(1)) {
        if (startsWithAction(chunk) || ACTOR_PATTERN.test(chunk)) result.push(chunk);
        else result[result.length - 1] = `${result[result.length - 1]}, ${chunk}`;
      }
      return result.flatMap(splitConjunction);
    })
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts : [value];
}

export function positiveCondition(condition: string): string {
  let result = condition.trim().replace(/[?.!]+$/, '');
  for (const pair of NEGATIVE_PAIRS) {
    if (pair.pattern.test(result)) {
      result = result.replace(pair.pattern, pair.replace);
      break;
    }
  }
  return result;
}

export function parseConditionalClause(value: string): ConditionalParts | null {
  const cleaned = stripMarkdownInline(value).replace(/[.!]+$/, '').trim();
  if (!cleaned) return null;

  let match = cleaned.match(
    /^(?:if|when|whenever|in case)\s+(.+?)\s*(?:,|;|\bthen\b)\s*(.+?)(?:\s*(?:,|;)?\s*(?:otherwise|else|or else)\s*,?\s*(.+))?$/i,
  );
  let polarity: 'positive' | 'negative' = 'positive';
  let condition = '';
  let yes: string | undefined;
  let no: string | undefined;

  if (match) {
    condition = match[1] ?? '';
    const action = match[2] ?? '';
    const alternative = match[3];
    const negative = NEGATIVE_CONDITION.test(condition);
    polarity = negative ? 'negative' : 'positive';
    if (negative) {
      no = action.trim() || undefined;
      yes = alternative?.trim() || undefined;
    } else {
      yes = action.trim() || undefined;
      no = alternative?.trim() || undefined;
    }
  } else {
    match = cleaned.match(/^unless\s+(.+?)\s*(?:,|;|\bthen\b)\s*(.+)$/i);
    if (match) {
      condition = match[1] ?? '';
      polarity = 'negative';
      no = match[2]?.trim() || undefined;
    } else {
      match = cleaned.match(/^(.+?)\s+(?:if|when)\s+(.+)$/i);
      if (!match) return null;
      const action = match[1] ?? '';
      condition = match[2] ?? '';
      polarity = NEGATIVE_CONDITION.test(condition) ? 'negative' : 'positive';
      if (polarity === 'negative') no = action.trim();
      else yes = action.trim();
    }
  }

  if (!condition) return null;
  const positive = positiveCondition(condition);
  let decision = decisionLabel(positive);
  if (polarity === 'negative') {
    if (/\bpayment|transaction\b/i.test(condition)) decision = 'Payment successful?';
    else if (/\bfile|document|format\b/i.test(condition)) decision = 'File valid?';
    else if (/\bvalidation|validate\b/i.test(condition)) decision = 'Validation successful?';
  }
  return {
    condition: positive,
    decision,
    yes: yes?.replace(/^(?:then|please)\s+/i, '').trim() || undefined,
    no: no?.replace(/^(?:then|please)\s+/i, '').trim() || undefined,
    polarity,
  };
}

export function isOtherwiseClause(value: string): boolean {
  return /^(?:otherwise|else|or else|if not|in that case)\b/i.test(stripMarkdownInline(value));
}

export function stripOtherwise(value: string): string {
  return stripMarkdownInline(value).replace(/^(?:otherwise|else|or else|if not|in that case)\b\s*[,:]?\s*/i, '');
}

export function extractActor(value: string): string | undefined {
  const cleaned = stripMarkdownInline(value);
  const match = cleaned.match(ACTOR_PATTERN);
  if (match) {
    const raw = match[1].toLowerCase();
    if (raw === 'ai' || raw === 'assistant') return 'AI assistant';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  const named = cleaned.match(/^([A-Z][A-Za-z0-9&'-]*(?:\s+[A-Z][A-Za-z0-9&'-]*){0,3}\s+(?:Agent|Service|System|Engine|Pipeline|Worker|Module|Bot))\b/);
  return named?.[1];
}

export function stepLabel(value: string): string {
  let label = stripMarkdownInline(value)
    .replace(/^(?:then|next|after that|finally|also|and)\s+/i, '')
    .replace(/^(?:please|you should|we will|it will|this will)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label) return '';
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return label.length > 140 ? `${label.slice(0, 137).trimEnd()}…` : label;
}

export function decisionFromCheck(value: string): string | null {
  const cleaned = stripMarkdownInline(value).replace(/[.!]+$/, '').trim();
  const match = cleaned.match(
    /^(?:the\s+\w+\s+)?(?:checks?|validates?|verifies?|assess(?:es)?|evaluates?|screens?|reviews?|qualif(?:y|ies)|determines?|tests?)\s+(.+)$/i,
  );
  if (!match) return null;
  const object = match[1]
    .replace(/^(?:the|a|an|their|its|his|her)\s+/i, '')
    .replace(/\b(?:of|for|against)\b.*$/i, '')
    .trim();
  if (!object) return null;

  if (/\beligib/i.test(object)) return 'Eligible?';
  if (/\bqualification|\bqualifications\b/i.test(object)) return 'Eligible?';
  if (/\bcredentials?\b/i.test(object)) return 'Credentials valid?';
  if (/\brequirements?\b/i.test(object)) return 'Requirements met?';
  if (/\bpayment|\btransaction\b/i.test(object)) return 'Payment successful?';
  if (/\bfile|\bdocument|\bformat\b/i.test(object)) return 'File valid?';
  if (/\bapproval|\bapproved\b/i.test(object)) return 'Approved?';
  if (/\bavailab/i.test(object)) return 'Available?';
  return `${object.charAt(0).toUpperCase()}${object.slice(1)} valid?`;
}

export function isQualifiedBranch(value: string): boolean {
  const cleaned = stripMarkdownInline(value);
  return (
    /^(?:qualified|eligible|approved|valid|verified|successful|accepted|passing)\b/i.test(cleaned) &&
    /\b(?:proceed|continue|advance|move|go|schedule|interview|next|onward)\b/i.test(cleaned)
  );
}

export function isRejectedBranch(value: string): boolean {
  return /^(?:others|everyone else|remaining|the rest|unqualified|rejected|ineligible|those who (?:do not|don't|cannot)|otherwise)\b/i.test(
    stripMarkdownInline(value),
  );
}

export function hasParallelMarker(value: string): boolean {
  return /\b(in parallel|simultaneously|at the same time|concurrently|independently)\b/i.test(value);
}

export function splitParallel(value: string): string[] {
  const parts = stripMarkdownInline(value)
    .replace(/\b(?:in parallel|simultaneously|at the same time|concurrently|independently)\b/gi, '')
    .split(/\s*(?:,|;|\band\b|\bwhile\b|\bplus\b|\bthen\b)\s+/i)
    .map((part) => part.trim().replace(/[.!?]+$/, ''))
    .filter(
      (part) =>
        part.length > 2 &&
        startsWithAction(part) &&
        !/^(?:then|finally|after that|next|before|after)\b/i.test(part),
    );
  return parts.length >= 2 ? parts : [];
}

export function detectLoop(value: string): { prefix: string; target: string } | null {
  return matchLoopPhrase(stripMarkdownInline(value));
}

export function hasArrowChain(value: string): boolean {
  return splitInlineArrows(value).length > 1;
}

export function extractObjective(text: string): string | undefined {
  const sentences = splitSentences(text);
  const build = sentences.find((sentence) =>
    /^(?:build|create|design|develop|implement|make|launch|generate|set up|plan|automate|architect)\b/i.test(
      stripMarkdownInline(sentence),
    ),
  );
  if (build) return stepLabel(build);
  const goal = sentences.find((sentence) => /\b(?:goal|objective|purpose) is\b/i.test(sentence));
  if (goal) return stepLabel(goal);
  const first = sentences[0];
  return first ? stepLabel(first) : undefined;
}

export function inferCategory(text: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return 'General workflow';
}

export function extractActors(text: string): string[] {
  const actors = new Set<string>();
  for (const sentence of splitSentences(text)) {
    for (const clause of splitClauses(sentence)) {
      const actor = extractActor(clause);
      if (actor && actor.length <= 40) actors.add(actor);
    }
  }
  if (/\bsystem\b/i.test(text)) actors.add('System');
  if (/\buser\b/i.test(text)) actors.add('User');
  if (actors.size === 0) actors.add('User');
  return [...actors].slice(0, 8);
}

export function extractSystems(text: string): string[] {
  const systems = new Set<string>();
  for (const match of text.matchAll(SYSTEM_WORDS)) {
    const value = match[0].toLowerCase();
    if (value.length > 2) systems.add(value.charAt(0).toUpperCase() + value.slice(1));
  }
  return [...systems].slice(0, 10);
}

function cleanIo(value: string): string {
  return value
    .replace(/[.,;:!?]+$/, '')
    .replace(/\b(?:into|to|from|in|the|a|an)\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function extractIo(text: string): { inputs: string[]; outputs: string[] } {
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  for (const match of text.matchAll(INPUT_PATTERN)) {
    const value = cleanIo(match[0]);
    if (/\b(?:confirmation|report|email|invoice|receipt|notification|response)\b/i.test(value)) {
      outputs.add(value);
    } else {
      inputs.add(value);
    }
  }
  for (const match of text.matchAll(OUTPUT_PATTERN)) {
    const value = cleanIo(match[0]);
    if (value) outputs.add(value);
  }
  return { inputs: [...inputs].slice(0, 6), outputs: [...outputs].slice(0, 6) };
}

export function extractTitleAndBody(text: string): { title?: string; body: string } {
  return extractTitle(text) as { title?: string; body: string };
}

export function normalizeLabelForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(?:the|a|an|to|of|for|and|then|step|process|system)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordOverlap(a: string, b: string): number {
  const left = new Set(stemWords(normalizeLabelForCompare(a)));
  const right = new Set(stemWords(normalizeLabelForCompare(b)));
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size);
}

function stemWords(value: string): string[] {
  return value
    .split(' ')
    .filter((word) => word.length > 2)
    .map((word) =>
      word
        .replace(/(?:ions?|ings?|ed|es|s)$/i, '')
        .replace(/e$/i, ''),
    )
    .filter(Boolean);
}
