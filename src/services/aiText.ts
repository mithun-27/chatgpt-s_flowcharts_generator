import type { AiDiagram, FlowDiagram, LayoutDirection } from '../types/diagram';
import type { ChatMessage, HfSettings } from '../types/hf';
import { cleanDiagram, diagramToSummary } from '../utils/diagram';
import { extractJsonObject } from '../utils/json';
import { chatCompletion } from './hf';

const JSON_SCHEMA = `{
  "title": "Optional diagram title",
  "direction": "TB",
  "nodes": [
    {
      "id": "n1",
      "label": "Start",
      "shape": "startEnd",
      "color": "green",
      "provenance": "explicit",
      "confidence": 0.95,
      "rationale": "Why this node exists"
    }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "label": "Yes", "provenance": "explicit" }
  ],
  "analysis": {
    "objective": "Main objective in one sentence",
    "problem": "Problem being solved, if stated",
    "category": "Workflow category",
    "actors": ["Patient"],
    "systems": ["Payment provider"],
    "inputs": ["Registration details"],
    "outputs": ["Appointment confirmation"],
    "outcome": "Expected final outcome",
    "assumptions": ["Reasonable interpretation you made"],
    "questions": ["Only genuinely important clarification questions"],
    "warnings": ["Where the source was ambiguous"]
  }
}`;

const ANALYSIS_RULES = `Analysis rules:
- Understand intent before drawing. Identify the objective, problem, category, actors, systems, inputs, outputs and outcome.
- Preserve important names, technical terms, conditions and relationships from the source.
- Mark a node "provenance": "explicit" when it appears in the source; use "inferred" for a step you had to add to complete the flow. Keep inferred steps minimal and put the reason in "rationale".
- Set confidence between 0 and 1. Lower it when the source is ambiguous.
- Do not invent unrelated business rules. If something essential is missing, add a focused clarification question and use a clearly marked reasonable assumption.
- Never output 100% certainty for an ambiguous source.`;

const GRAPH_RULES = `Graph rules:
- Always include a start and an end terminator.
- Use a decision diamond for any question, check, gate, eligibility test or approval. Label outgoing edges Yes/No (or the real branch text).
- Preserve conditions, alternative paths, merges, intentional loops and parallel paths. Do not delete a legitimate feedback loop just to make the graph acyclic.
- Use inputOutput for data entering or leaving the workflow, document for reports/records, connector only for off-page jumps, and process for ordinary actions.
- Assign shapes from the node's role in the graph, not from a single keyword.
- Every edge must reference an existing node id. Never emit self-loops.
- Keep labels under 100 characters and use at most 48 nodes.
- Do not include coordinates or visual styling. A layout engine computes positions.`;

const COMPILER_SYSTEM_PROMPT = `You are a hybrid flowchart intelligence engine: a senior workflow analyst, NLP engineer and graph designer.
Your job is to understand what the user means, reason about the workflow logic, then compile a valid directed graph.
Return ONLY valid JSON. No markdown fences, no commentary.

Schema:
${JSON_SCHEMA}

Allowed shapes: startEnd, process, decision, inputOutput, document, connector.
Allowed colors: slate, blue, green, amber, rose, violet.
Allowed directions: TB, LR, BT, RL.

${GRAPH_RULES}
${ANALYSIS_RULES}`;

const MODIFY_SYSTEM_PROMPT = `You are a graph-aware flowchart assistant. You receive an existing editable graph and an instruction.
Understand the existing diagram first. Modify THAT graph; never replace it with an unrelated diagram.
Return ONLY valid JSON with the complete updated diagram (not a diff).

Schema:
${JSON_SCHEMA}

Allowed shapes: startEnd, process, decision, inputOutput, document, connector.
Allowed colors: slate, blue, green, amber, rose, violet.
Allowed directions: TB, LR, BT, RL.

${GRAPH_RULES}
${ANALYSIS_RULES}
Modification rules:
- Preserve existing node ids and labels unless the instruction requires changing them.
- Keep all unaffected nodes, edges and their relationships.
- If asked to add detail, add meaningful steps; if asked to simplify, merge rather than delete important logic; if asked to add exception handling, add a decision + recovery path.
- If asked about missing dependencies, parallel execution or alternatives, encode the answer in the graph and explain it in analysis.warnings or analysis.assumptions.
- Never compute coordinates.`;

function diagramForPrompt(diagram: FlowDiagram): string {
  const clean = cleanDiagram(diagram);
  return JSON.stringify({
    title: clean.title,
    direction: clean.direction,
    nodes: clean.nodes.map((node) => ({
      id: node.id,
      label: node.data.label,
      shape: node.data.shape,
      color: node.data.color,
      ...(node.data.provenance ? { provenance: node.data.provenance } : {}),
      ...(typeof node.data.confidence === 'number'
        ? { confidence: node.data.confidence }
        : {}),
    })),
    edges: clean.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      ...(edge.label ? { label: edge.label } : {}),
    })),
    ...(diagram.analysis
      ? {
          analysis: {
            objective: diagram.analysis.objective,
            category: diagram.analysis.category,
            quality: diagram.analysis.quality,
            warnings: diagram.analysis.warnings,
          },
        }
      : {}),
  });
}

async function requestJson(
  settings: HfSettings,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<AiDiagram> {
  const response = await chatCompletion({
    token: settings.token,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.textModel,
    temperature: options.temperature ?? 0.15,
    maxTokens: options.maxTokens ?? 3200,
    signal: options.signal,
    messages,
  });

  const parsed = extractJsonObject(response) as AiDiagram | null;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
    throw new Error('The model did not return a usable diagram.');
  }
  return parsed;
}

export async function generateDiagramFromPrompt(
  settings: HfSettings,
  prompt: string,
  signal?: AbortSignal,
  direction: LayoutDirection = 'TB',
): Promise<AiDiagram> {
  return requestJson(
    settings,
    [
      { role: 'system', content: COMPILER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Understand the intent and create a flowchart from this description. Use direction "${direction}".

DESCRIPTION:
${prompt}`,
      },
    ],
    { maxTokens: 3000, signal },
  );
}

export async function structureWorkflowText(
  settings: HfSettings,
  workflowText: string,
  signal?: AbortSignal,
  direction: LayoutDirection = 'TB',
  hint?: string,
): Promise<AiDiagram> {
  const hintBlock = hint
    ? `\nA deterministic pre-analysis produced the following candidate structure. Use it as a hint, but correct it if the source clearly means something else:\n${hint}\n`
    : '';

  return requestJson(
    settings,
    [
      { role: 'system', content: COMPILER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Compile this pasted workflow into a flowchart. It may be prose, a ChatGPT answer, numbered steps, an ASCII diagram, technical documentation, an agent workflow or a business process. Detect the intent and preserve all meaningful steps, decisions, YES/NO branches, merges and loops. Do not invent unrelated steps. Use direction "${direction}".
${hintBlock}
WORKFLOW:
${workflowText}`,
      },
    ],
    { maxTokens: 3200, signal },
  );
}

export async function modifyDiagramWithAi(
  settings: HfSettings,
  diagram: FlowDiagram,
  instruction: string,
  signal?: AbortSignal,
): Promise<AiDiagram> {
  return requestJson(
    settings,
    [
      { role: 'system', content: MODIFY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Update the existing flowchart according to the instruction.
Return the COMPLETE updated diagram, not a diff. Preserve existing ids and relationships where possible.

CURRENT DIAGRAM:
${diagramForPrompt(diagram)}

INSTRUCTION:
${instruction}`,
      },
    ],
    { maxTokens: 3800, signal },
  );
}

export async function explainDiagramWithAi(
  settings: HfSettings,
  diagram: FlowDiagram,
  signal?: AbortSignal,
): Promise<string> {
  const response = await chatCompletion({
    token: settings.token,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.textModel,
    temperature: 0.25,
    maxTokens: 700,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'You explain flowcharts to non-technical readers. Be accurate, concise, and do not invent steps. Explain the objective, the main path, each decision and its branches, any loop, and the final outcome. Use 4-7 short sentences or bullets.',
      },
      {
        role: 'user',
        content: `Explain this flowchart.\n\nSUMMARY: ${diagramToSummary(diagram)}\n\nDIAGRAM:\n${diagramForPrompt(diagram)}`,
      },
    ],
  });

  return response.trim();
}

export async function answerDiagramQuestionWithAi(
  settings: HfSettings,
  diagram: FlowDiagram,
  question: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await chatCompletion({
    token: settings.token,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.textModel,
    temperature: 0.2,
    maxTokens: 650,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'You are a graph-aware workflow analyst. Answer using ONLY the supplied diagram. If the diagram does not contain enough information, say what is missing instead of inventing it. Be concise and specific.',
      },
      {
        role: 'user',
        content: `DIAGRAM:\n${diagramForPrompt(diagram)}\n\nQUESTION:\n${question}`,
      },
    ],
  });

  return response.trim();
}
