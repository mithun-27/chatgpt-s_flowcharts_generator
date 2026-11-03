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
): Promise<AiDiagram> {
  const response = await chatCompletion({
    token: settings.token,
    model: settings.textModel,
    temperature: 0.15,
    maxTokens: 2800,
    signal,
    messages: [
      { role: 'system', content: JSON_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Turn this pasted workflow into a clean flowchart. Keep all meaningful steps, split branches where appropriate, and do not invent unrelated steps.\n\nWORKFLOW:\n${workflowText}`,
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
