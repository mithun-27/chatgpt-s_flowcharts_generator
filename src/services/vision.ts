import type { AiDiagram } from '../types/diagram';
import type { HfSettings } from '../types/hf';
import { extractJsonObject } from '../utils/json';
import { chatCompletion } from './hf';

const VISION_SYSTEM_PROMPT = `You are a precise flowchart vision and reconstruction engine.
Analyze the uploaded flowchart image and reconstruct its logical graph.

Return ONLY a valid JSON object. No markdown, no commentary.
Schema:
{
  "title": "Optional title",
  "direction": "TB",
  "nodes": [
    { "id": "n1", "label": "Start", "shape": "startEnd", "color": "green", "provenance": "explicit", "confidence": 0.95 }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "label": "Yes", "provenance": "explicit" }
  ],
  "analysis": {
    "objective": "What this diagram describes",
    "category": "Workflow category",
    "assumptions": ["What you inferred from a low-confidence region"],
    "warnings": ["Unreadable or ambiguous parts"],
    "questions": ["Only important clarification questions"]
  }
}

Allowed shapes: startEnd, process, decision, inputOutput, document, connector.
Allowed colors: slate, blue, green, amber, rose, violet.
Allowed directions: TB, LR, BT, RL.

Rules:
- Transcribe every readable node label. Do not invent text that is not visible.
- Use shape geometry AND role: diamond = decision, parallelogram = inputOutput, wavy-bottom rectangle = document, circle = connector, oval/stadium = startEnd, rectangle = process.
- Follow arrowheads to recover edge direction. Put branch text (Yes/No/Retry) on edge labels.
- Recover merges, branches and loops. Do not force an acyclic graph.
- Mark uncertain nodes/edges with lower confidence and put the reason in analysis.warnings.
- Do not include coordinates or styling; a layout engine positions the graph.
- Keep labels under 100 characters. Use at most 60 nodes.
- Return JSON only.`;

export async function extractDiagramFromImage(
  settings: HfSettings,
  imageDataUrl: string,
  signal?: AbortSignal,
  ocrHint?: string,
): Promise<AiDiagram> {
  const hint = ocrHint?.trim()
    ? `\nLocal OCR read these text fragments (may be noisy). Use them to correct labels, but trust the image geometry for structure:\n${ocrHint.slice(0, 4000)}`
    : '';

  const response = await chatCompletion({
    token: settings.token,
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.visionModel,
    temperature: 0.05,
    maxTokens: 4000,
    signal,
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Reconstruct this flowchart as editable nodes and edges.${hint}\nReturn only the JSON object.`,
          },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  const parsed = extractJsonObject(response) as AiDiagram;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
    throw new Error('The vision model did not return a usable diagram.');
  }
  return parsed;
}
