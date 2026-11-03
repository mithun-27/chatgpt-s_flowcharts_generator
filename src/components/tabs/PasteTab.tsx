import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Code2,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { FlowDiagram } from '../../types/diagram';
import type { HfSettings } from '../../types/hf';
import { isMermaid, parseMermaid } from '../../utils/mermaid';
import { normalizeAiDiagram } from '../../utils/diagram';
import { shortError } from '../../utils/json';
import { SAMPLE_WORKFLOW_TEXT } from '../../utils/samples';
import { textToDiagram } from '../../utils/textToFlow';
import { structureWorkflowText } from '../../services/aiText';
import type { ToastKind } from '../Toast';

interface PasteTabProps {
  settings: HfSettings;
  onLoadDiagram: (diagram: FlowDiagram, message?: string) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenSettings: () => void;
  onPreviewMermaid: (code: string) => void;
}

export default function PasteTab({
  settings,
  onLoadDiagram,
  onToast,
  onOpenSettings,
  onPreviewMermaid,
}: PasteTabProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mermaid = useMemo(() => isMermaid(text), [text]);

  const runLocal = () => {
    setError('');
    try {
      if (mermaid) {
        const diagram = parseMermaid(text);
        onLoadDiagram(diagram, `Converted Mermaid into ${diagram.nodes.length} editable nodes.`);
      } else {
        const diagram = textToDiagram(text);
        onLoadDiagram(
          diagram,
          `Created ${diagram.nodes.length} nodes with the local workflow parser.`,
        );
      }
    } catch (localError) {
      const message = shortError(localError);
      setError(message);
      onToast(message, 'error');
    }
  };

  const runAi = async () => {
    if (!settings.token) {
      onToast('Add a Hugging Face token to use AI structuring, or use the simple parser.', 'info');
      onOpenSettings();
      return;
    }
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await structureWorkflowText(settings, text);
      const { diagram, warnings } = normalizeAiDiagram(result);
      onLoadDiagram(
        diagram,
        warnings[0] ?? `AI structured the workflow into ${diagram.nodes.length} nodes.`,
      );
    } catch (aiError) {
      const message = shortError(aiError);
      setError(message);
      onToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const primary = () => {
    if (mermaid) {
      runLocal();
    } else if (settings.token) {
      void runAi();
    } else {
      runLocal();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FileText size={14} />
          <span>Plain workflow text or Mermaid syntax</span>
          {mermaid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Code2 size={10} />
              Mermaid detected
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setText(SAMPLE_WORKFLOW_TEXT);
              setError('');
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <FlaskConical size={12} />
            Load sample
          </button>
          {text && (
            <button
              type="button"
              onClick={() => {
                setText('');
                setError('');
              }}
              className="text-[11px] text-slate-400 hover:text-rose-500"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError('');
        }}
        rows={8}
        spellCheck={false}
        placeholder={`Paste a workflow...\n\n1. Customer submits an order\n2. Validate payment\n3. If approved, pack and ship\n4. Otherwise notify the customer\n\nOr paste Mermaid:\nflowchart TD\n  A([Start]) --> B[Validate order]\n  B --> C{Approved?}\n  C -->|Yes| D[Ship order]\n  C -->|No| E[Notify customer]`}
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-[12px] leading-relaxed text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
      />

      {!settings.token && !mermaid && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          <Wand2 size={14} className="mt-0.5 shrink-0 text-blue-500" />
          <p>
            Demo mode uses a deterministic workflow parser. Add a token to let AI
            handle messy or ambiguous text.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={primary}
          disabled={!text.trim() || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : mermaid ? (
            <Play size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          {busy
            ? 'Structuring workflow…'
            : mermaid
              ? 'Convert Mermaid'
              : settings.token
                ? 'Structure with AI'
                : 'Create with simple parser'}
        </button>

        {!mermaid && settings.token && (
          <button
            type="button"
            onClick={runLocal}
            disabled={!text.trim() || busy}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Use simple parser
          </button>
        )}

        {mermaid && (
          <button
            type="button"
            onClick={() => onPreviewMermaid(text)}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Preview Mermaid
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
