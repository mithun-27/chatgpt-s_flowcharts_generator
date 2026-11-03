import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import type { FlowNode } from '../types/diagram';

interface CaptureGeometry {
  width: number;
  height: number;
  transform: string;
}

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function safeFilename(name: string): string {
  return name.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function captureGeometry(nodes: FlowNode[]): CaptureGeometry {
  const bounds = getNodesBounds(nodes);
  const padding = 120;
  const width = Math.min(3200, Math.max(720, Math.ceil(bounds.width + padding)));
  const height = Math.min(3200, Math.max(480, Math.ceil(bounds.height + padding)));
  const viewport = getViewportForBounds(bounds, width, height, 0.1, 2, 0.1);
  return {
    width,
    height,
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  };
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

export function canvasBackground(container: HTMLElement): string {
  const value = getComputedStyle(container).getPropertyValue('--canvas-bg').trim();
  return value || '#f8fafc';
}

async function prepareCapture(
  container: HTMLElement,
  nodes: FlowNode[],
): Promise<{ viewport: HTMLElement; geometry: CaptureGeometry }> {
  const viewport = container.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) throw new Error('The canvas is not ready yet. Try again in a moment.');
  if (nodes.length === 0) throw new Error('Add at least one node before exporting.');

  container.classList.add('exporting');
  await nextFrame();
  return { viewport, geometry: captureGeometry(nodes) };
}

export async function exportPng(
  container: HTMLElement,
  nodes: FlowNode[],
  background: string,
  name = 'flowchart',
): Promise<void> {
  const { toPng } = await import('html-to-image');
  const { viewport, geometry } = await prepareCapture(container, nodes);
  try {
    const dataUrl = await toPng(viewport, {
      backgroundColor: background,
      width: geometry.width,
      height: geometry.height,
      pixelRatio: 2,
      cacheBust: true,
      style: {
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        transform: geometry.transform,
      },
    });
    downloadDataUrl(dataUrl, `${safeFilename(name)}-${timestamp()}.png`);
  } finally {
    container.classList.remove('exporting');
  }
}

export async function exportSvg(
  container: HTMLElement,
  nodes: FlowNode[],
  background: string,
  name = 'flowchart',
): Promise<void> {
  const { toSvg } = await import('html-to-image');
  const { viewport, geometry } = await prepareCapture(container, nodes);
  try {
    const dataUrl = await toSvg(viewport, {
      backgroundColor: background,
      width: geometry.width,
      height: geometry.height,
      cacheBust: true,
      style: {
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        transform: geometry.transform,
      },
    });
    downloadDataUrl(dataUrl, `${safeFilename(name)}-${timestamp()}.svg`);
  } finally {
    container.classList.remove('exporting');
  }
}

export async function exportPdf(
  container: HTMLElement,
  nodes: FlowNode[],
  background: string,
  name = 'flowchart',
): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([
    import('html-to-image'),
    import('jspdf'),
  ]);
  const { viewport, geometry } = await prepareCapture(container, nodes);
  try {
    const dataUrl = await toPng(viewport, {
      backgroundColor: background,
      width: geometry.width,
      height: geometry.height,
      pixelRatio: 2,
      cacheBust: true,
      style: {
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        transform: geometry.transform,
      },
    });

    const pdf = new jsPDF({
      orientation: geometry.width >= geometry.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [geometry.width, geometry.height],
      hotfixes: ['px_scaling'],
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, geometry.width, geometry.height);
    pdf.save(`${safeFilename(name)}-${timestamp()}.pdf`);
  } finally {
    container.classList.remove('exporting');
  }
}
