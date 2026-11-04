import type { AiDiagram, LayoutDirection } from '../types/diagram';
import { understandWorkflow, type UnderstandingResult } from '../intelligence/understand';

export interface OcrLine {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  understanding: UnderstandingResult;
  diagram: AiDiagram;
  warnings: string[];
  assumptions: string[];
  questions: string[];
  width: number;
  height: number;
}

interface RawWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

type Progress = (message: string, fraction: number) => void;

const DECORATION = /^[|+\-—_=<>^v↑↓→←*.·•/\\()[\]{}:;]+$/i;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = dataUrl;
  });
}

/**
 * Grayscale + upscale + contrast boost. Tesseract is much more reliable on
 * clean, high-resolution text than on a compressed screenshot thumbnail.
 */
export async function preprocessForOcr(
  dataUrl: string,
  maxWidth = 2200,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImage(dataUrl);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) {
    return { dataUrl, width: naturalWidth, height: naturalHeight };
  }

  const scale = Math.min(maxWidth / naturalWidth, 3);
  const width = Math.max(320, Math.round(naturalWidth * scale));
  const height = Math.max(240, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { dataUrl, width: naturalWidth, height: naturalHeight };

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const contrast = 1.35;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    const boosted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
    pixels[index] = boosted;
    pixels[index + 1] = boosted;
    pixels[index + 2] = boosted;
  }
  context.putImageData(frame, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

function collectLines(data: unknown): OcrLine[] {
  const page = data as {
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          text?: string;
          confidence?: number;
          bbox?: { x0: number; y0: number; x1: number; y1: number };
          words?: RawWord[];
        }>;
      }>;
    }> | null;
  };

  const lines: OcrLine[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).filter(
          (word) =>
            word.text.trim().length > 0 &&
            word.confidence >= 30 &&
            !DECORATION.test(word.text.trim()),
        );
        if (words.length === 0) continue;

        const text = words
          .map((word) => word.text.trim())
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!text || DECORATION.test(text)) continue;

        const bbox = line.bbox ?? {
          x0: Math.min(...words.map((word) => word.bbox.x0)),
          y0: Math.min(...words.map((word) => word.bbox.y0)),
          x1: Math.max(...words.map((word) => word.bbox.x1)),
          y1: Math.max(...words.map((word) => word.bbox.y1)),
        };
        lines.push({
          text,
          confidence: Math.round(line.confidence ?? 0),
          x: bbox.x0,
          y: bbox.y0,
          width: Math.max(1, bbox.x1 - bbox.x0),
          height: Math.max(1, bbox.y1 - bbox.y0),
        });
      }
    }
  }

  return lines;
}

/**
 * Reconstruct reading order from geometry. Flowcharts are not plain prose:
 * stacked boxes form a column, side-by-side boxes form branches. We sort by
 * row bands (using the median text height) and then left-to-right inside a row.
 */
export function orderOcrLines(lines: OcrLine[]): OcrLine[] {
  if (lines.length <= 1) return [...lines];
  const sorted = [...lines].sort((left, right) => left.y - right.y || left.x - right.x);
  const heights = sorted.map((line) => line.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 16;
  const rowTolerance = Math.max(10, median * 0.8);

  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(line.y - row[0].y) <= rowTolerance) {
      row.push(line);
    } else {
      rows.push([line]);
    }
  }

  return rows.flatMap((row) => row.sort((left, right) => left.x - right.x));
}

function toWorkflowText(lines: OcrLine[]): string {
  return lines
    .map((line) => line.text.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !DECORATION.test(line))
    .join('\n');
}

let workerPromise: Promise<{
  recognize: (
    image: string,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data: unknown }>;
  terminate: () => Promise<unknown>;
}> | null = null;

async function getWorker(onProgress?: Progress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1, {
        logger: (message) => {
          if (!onProgress) return;
          const status = String(message.status ?? 'working');
          const fraction = typeof message.progress === 'number' ? message.progress : 0;
          if (/recognizing/i.test(status)) {
            onProgress('Reading text from the image…', 0.55 + fraction * 0.4);
          } else if (/loading|initializing/i.test(status)) {
            onProgress('Loading the local OCR engine…', Math.min(0.5, fraction * 0.5));
          }
        },
      });
    })();
  }
  return workerPromise;
}

/**
 * Local screenshot reconstruction: OCR, geometry-based reading order, then the
 * deterministic workflow reasoner. It does not need a token. It is honest about
 * its limits: it recovers text and order, not every arrow, so the result is a
 * starting graph that the user can edit or improve with a vision model.
 */
export async function reconstructFromScreenshot(
  dataUrl: string,
  options: { direction?: LayoutDirection; onProgress?: Progress } = {},
): Promise<OcrResult> {
  const direction = options.direction ?? 'TB';
  options.onProgress?.('Preparing the screenshot…', 0.05);
  const prepared = await preprocessForOcr(dataUrl);

  const worker = await getWorker(options.onProgress);
  options.onProgress?.('Reading text from the image…', 0.55);
  const recognition = await worker.recognize(prepared.dataUrl, {}, { text: true, blocks: true });
  const lines = orderOcrLines(collectLines(recognition.data));
  const text = toWorkflowText(lines);

  if (!text.trim()) {
    throw new Error(
      'No readable text was found in that image. Try a clearer screenshot with larger text, or add a vision model in AI settings.',
    );
  }

  const understanding = understandWorkflow(text, direction);
  const warnings = [
    ...understanding.warnings,
    'Local OCR reconstruction recovers text and reading order; arrow directions and shape outlines are best-effort. Review the graph and use a vision model for complex screenshots.',
  ];
  if (lines.some((line) => line.confidence < 60)) {
    warnings.push('Some text was read with low confidence. Check labels for OCR mistakes.');
  }

  return {
    text,
    lines,
    understanding,
    diagram: understanding.diagram,
    warnings,
    assumptions: [
      ...understanding.assumptions,
      'Screenshot text was ordered using its on-page geometry (top-to-bottom, then left-to-right).',
    ],
    questions: understanding.questions,
    width: prepared.width,
    height: prepared.height,
  };
}
