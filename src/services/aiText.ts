import type { AiDiagram, FlowDiagram } from '../types/diagram';
import type { HfSettings } from '../types/hf';
import { cleanDiagram } from '../utils/diagram';
import { extractJsonObject } from '../utils/json';
import { diagramToSummary } from '../utils/diagram';
import { chatCompletion } from './hf';

const JSON_SYSTEM_PROMPT = `You are a flowchart compiler for a visual editor.
Return ONLY a valid JSON diagram. No markdown fences, no explanation.

Schema:
{
  "title": "Optional diagram title",
  "direction": "TB",
  "nodes": [
    { "id": "n1", "label": "Start", "shape": "startEnd", "color": "green" }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "label": "Yes" }
  ]
}

Allowed shapes: startEnd, process, decision, inputOutput, document, connector.
Allowed colors: slate, blue, green, amber, rose, violet.

Rules:
- 4 to 24 nodes. Always include a start and an end.
- Use concise labels (under 90 characters).
- Use decision nodes for branching and label outgoing edges Yes/No.
- Connect every node into a coherent flow.
- direction should be "TB" (top to bottom) unless the user asks for horizontal.
- Do not include coordinates or styling.`;

const STRUCTURE_SYSTEM_PROMPT = `You are an expert flowchart compiler. Convert pasted workflows, ASCII flowcharts, numbered steps, and ChatGPT plans into a clean, professional diagram.
Return ONLY valid JSON. No markdown fences, no commentary.

Schema:
{
  "title": "Optional title from the source",
  "direction": "TB",
  "nodes": [
    { "id": "n1", "label": "User Input", "shape": "inputOutput", "color": "blue" },
    { "id": "n2", "label": "Research Agent\\nMarket & Competitor Analysis", "shape": "process" }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "label": "" }
  ]
}

Allowed shapes: startEnd, process, decision, inputOutput, document, connector.
Allowed colors: slate, blue, green, amber, rose, violet.

Compilation rules:
- Preserve the original meaning and ordering. Do not invent unrelated steps.
- Group a name line with its description into ONE node, using "\\n" inside the label, when they clearly describe the same step (for example "Research Agent" + "Market & Competitor Analysis").
- Do NOT treat every source line as a separate node. Do NOT create a node for decorative ASCII borders, arrow characters, or rows that only contain "Yes"/"No" branch labels.
- Use decision diamonds for questions and gates. Put "Yes" and "No" on the correct outgoing edges.
- Preserve branches, merges, loops, and feedback connections from the source.
- Use inputOutput for inputs/outputs, startEnd for explicit start/end steps, and document for reports/records.
- Every edge must reference an existing node id. Never emit self-loops.
- Keep labels concise (under 120 characters). At most 40 nodes.
- Do not include coordinates; layout is handled elsewhere.
- Return an empty edges array only when there is genuinely one node.`;

function diagramForPrompt(diagram: FlowDiagram): string {
  const clean = cleanDiagram(diagram);
  return JSON.stringify({
    direction: clean.direction,
    nodes: clean.nodes.map((node) => ({
      id: node.id,
      label: node.data.label,
      shape: node.data.shape,
      color: node.data.color,
    })),
    edges: clean.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      ...(edge.label ? { label: edge.label } : {}),
    })),
  });
}

export async function generateDiagramFromPrompt(
  settings: HfSettings,
  prompt: string,
  signal?: AbortSignal,
): Promise<AiDiagram> {
  const response = await chatCompletion({
    token: settings.token,
    model: settings.textModel,
    temperature: 0.2,
    maxTokens: 2600,
    signal,
    messages: [
      { role: 'system', content: JSON_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Create a flowchart from this description:\n\n${prompt}`,
      },
    ],
  });

  const parsed = extractJsonObject(response) as AiDiagram;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error('The model did not return a diagram.');
  }
  return parsed;
}

export async function structureWorkflowText(
  settings: HfSettings,
  workflowText: string,
  signal?: AbortSignal,
  direction: 'TB' | 'LR' = 'TB',
): Promise<AiDiagram> {
  const response = await chatCompletion({
    token: settings.token,
    model: settings.textModel,
    temperature: 0.15,
    maxTokens: 2800,
    signal,
    messages: [
      { role: 'system', content: STRUCTURE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Compile this pasted workflow into a flowchart. Keep all meaningful steps, group name/description pairs, preserve YES/NO branches and loops, and do not invent unrelated steps. Use direction "${direction}".

WORKFLOW:
${workflowText}`,
      },
    ],
  });

  const parsed = extractJsonObject(response) as AiDiagram;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error('The model did not return a diagram.');
  }
  return parsed;
}

export async function modifyDiagramWithAi(
  settings: HfSettings,
  diagram: FlowDiagram,
  instruction: string,
  signal?: AbortSignal,
): Promise<AiDiagram> {
  const response = await chatCompletion({
    token: settings.token,
    model: settings.textModel,
    temperature: 0.15,
    maxTokens: 3200,
    signal,
    messages: [
      { role: 'system', content: JSON_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Update the flowchart according to the instruction.
Return the COMPLETE updated diagram, not a diff. Preserve existing node ids where possible.

CURRENT DIAGRAM:
${diagramForPrompt(diagram)}

INSTRUCTION:
${instruction}`,
      },
    ],
  });

  const parsed = extractJsonObject(response) as AiDiagram;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error('The model did not return an updated diagram.');
  }
  return parsed;
}

export async function explainDiagramWithAi(
  settings: HfSettings,
  diagram: FlowDiagram,
  signal?: AbortSignal,
): Promise<string> {
  const response = await chatCompletion({
    token: settings.token,
    model: settings.textModel,
    temperature: 0.25,
    maxTokens: 700,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'You explain flowcharts to non-technical readers. Be accurate, concise, and do not invent steps. Use 3-5 short sentences or bullets.',
      },
      {
        role: 'user',
        content: `Explain this flowchart.\n\nSUMMARY: ${diagramToSummary(diagram)}\n\nDIAGRAM:\n${diagramForPrompt(diagram)}`,
      },
    ],
  });

  return response.trim();
}
