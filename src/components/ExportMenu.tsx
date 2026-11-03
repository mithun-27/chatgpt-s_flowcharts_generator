import { useEffect, useRef, useState, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Braces,
  ChevronDown,
  Code2,
  Download,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import type { FlowDiagram, FlowEdge, FlowNode } from '../types/diagram';
import {
  canvasBackground,
  downloadText,
  exportPdf,
  exportPng,
  exportSvg,
} from '../services/exporter';
import { generateMermaid } from '../utils/mermaid';
import { toExportJson } from '../utils/diagram';
import { shortError } from '../utils/json';
import type { ToastKind } from './Toast';

interface ExportMenuProps {
  diagram: FlowDiagram;
  containerRef: RefObject<HTMLDivElement | null>;
  onToast: (message: string, kind?: ToastKind) => void;
}

type ExportKind = 'png' | 'svg' | 'pdf' | 'mermaid' | 'json';

export default function ExportMenu({ diagram, containerRef, onToast }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { getNodes } = useReactFlow<FlowNode, FlowEdge>();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = async (kind: ExportKind) => {
    if (busy) return;
    const container = containerRef.current;
    if (!container) {
      onToast('The canvas is not ready yet.', 'error');
      return;
    }
    if (diagram.nodes.length === 0) {
      onToast('Add at least one node before exporting.', 'info');
      return;
    }

    setOpen(false);
    setBusy(kind);
    try {
      if (kind === 'mermaid') {
        downloadText(generateMermaid(diagram), 'flowchart.mmd', 'text/plain');
      } else if (kind === 'json') {
        downloadText(toExportJson(diagram), 'flowchart.json', 'application/json');
      } else {
        const background = canvasBackground(container);
        const nodes = getNodes();
        if (kind === 'png') await exportPng(container, nodes, background, 'flowchart');
        if (kind === 'svg') await exportSvg(container, nodes, background, 'flowchart');
        if (kind === 'pdf') await exportPdf(container, nodes, background, 'flowchart');
      }
      onToast(
        kind === 'mermaid'
          ? 'Mermaid file downloaded.'
          : kind === 'json'
            ? 'JSON file downloaded.'
            : `${kind.toUpperCase()} export downloaded.`,
        'success',
      );
    } catch (error) {
      onToast(shortError(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const options: Array<{
    kind: ExportKind;
    label: string;
    hint: string;
    icon: typeof ImageIcon;
  }> = [
    { kind: 'png', label: 'PNG image', hint: 'Raster snapshot', icon: ImageIcon },
    { kind: 'svg', label: 'SVG vector', hint: 'Scalable image', icon: FileCode2 },
    { kind: 'pdf', label: 'PDF document', hint: 'Print-ready page', icon: FileText },
    { kind: 'mermaid', label: 'Mermaid', hint: 'Editable .mmd code', icon: Code2 },
    { kind: 'json', label: 'JSON', hint: 'Portable diagram data', icon: Braces },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Export
        <ChevronDown size={12} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.kind}
                type="button"
                role="menuitem"
                onClick={() => void run(option.kind)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Icon size={16} className="shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-800 dark:text-slate-100">
                    {option.label}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
