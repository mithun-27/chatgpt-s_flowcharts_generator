import type { AiDiagram } from '../types/diagram';
import type { HfSettings } from '../types/hf';
import { extractJsonObject } from '../utils/json';
import { chatCompletion } from './hf';

const VISION_SYSTEM_PROMPT = `You are a precise flowchart OCR and reconstruction engine.
Analyze the uploaded flowchart screenshot and reconstruct its logical structure.

Return ONLY a valid JSON object. No markdown, no commentary.
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
- Transcribe every readable node label exactly. Do not invent text that is not visible.
- A diamond is a decision. A parallelogram is inputOutput. A wavy-bottom rectangle is document. A circle is connector. An oval/stadium is startEnd. A rectangle is process.
- Preserve arrow direction. Put Yes/No/other branch text in the edge label.
- Do not include coordinates or styling.
- Keep labels under 100 characters.
- Use at most 60 nodes.
- Return JSON only.`;

export async function extractDiagramFromImage(
  settings: HfSettings,
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<AiDiagram> {
  const response = await chatCompletion({
    token: settings.token,
    model: settings.visionModel,
    temperature: 0.05,
    maxTokens: 3500,
    signal,
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Reconstruct this flowchart as editable nodes and edges. Return only the JSON object.',
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
