import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardCopy,
  Code2,
  Download,
  Eye,
  Loader2,
  Play,
} from 'lucide-react';
import type { FlowDiagram } from '../types/diagram';
import { parseMermaid } from '../utils/mermaid';
import { renderMermaidSvg } from '../services/mermaidPreview';
import { copyText, downloadText } from '../services/exporter';
import { shortError } from '../utils/json';
import Modal from './Modal';

interface MermaidDialogProps {
  open: boolean;
  initialCode: string;
  dark: boolean;
  onClose: () => void;
  onApplyDiagram: (diagram: FlowDiagram) => void;
}

type View = 'code' | 'preview';

export default function MermaidDialog({
  open,
  initialCode,
  dark,
  onClose,
  onApplyDiagram,
}: MermaidDialogProps) {
  const [view, setView] = useState<View>('code');
  const [code, setCode] = useState(initialCode);
  const [svg, setSvg] = useState('');
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(initialCode);
    setView('code');
    setSvg('');
    setError('');
    setCopied(false);
  }, [open, initialCode]);

  useEffect(() => {
    if (!open || !code.trim()) {
      setSvg('');
      return;
    }
    let cancelled = false;
    setRendering(true);
    const timer = window.setTimeout(() => {
      void renderMermaidSvg(code, dark)
        .then((result) => {
          if (cancelled) return;
          setSvg(result);
          setError('');
        })
        .catch((renderError: unknown) => {
          if (cancelled) return;
          setSvg('');
          setError(shortError(renderError));
        })
        .finally(() => {
          if (!cancelled) setRendering(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setRendering(false);
    };
  }, [open, code, dark]);

  const apply = () => {
    try {
      const diagram = parseMermaid(code);
      onApplyDiagram(diagram);
      onClose();
    } catch (applyError) {
      setError(shortError(applyError));
    }
  };

  const copy = async () => {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mermaid"
      description="Paste or edit Mermaid code, preview it, then apply it as editable nodes."
      widthClassName="max-w-4xl"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setView('code')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === 'code'
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Code2 size={13} />
              Code
            </button>
            <button
              type="button"
              onClick={() => setView('preview')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === 'preview'
                  ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Eye size={13} />
              Preview
              {rendering && <Loader2 size={11} className="animate-spin" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <ClipboardCopy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => downloadText(code, 'flowchart.mmd', 'text/plain')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download size={13} />
              .mmd
            </button>
          </div>
        </div>

        {view === 'code' ? (
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full resize-y rounded-xl border border-slate-300 bg-slate-950 p-3 font-mono text-[12px] leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Mermaid code"
          />
        ) : (
          <div className="flex min-h-[360px] items-center justify-center overflow-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
            {svg ? (
              <div
                className="max-w-full [&_svg]:h-auto [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : rendering ? (
              <span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                Rendering preview…
              </span>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fix the Mermaid code to see a preview.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Supports common <code>flowchart</code> / <code>graph</code> syntax,
            shapes, chained edges, and edge labels.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!code.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700"
            >
              <Play size={14} />
              Apply to canvas
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
