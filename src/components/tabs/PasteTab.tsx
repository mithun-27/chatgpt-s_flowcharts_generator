import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Code2,
  FileText,
  FlaskConical,
  LayoutTemplate,
  Loader2,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { FlowDiagram, LayoutDirection } from '../../types/diagram';
import type { HfSettings } from '../../types/hf';
import { isMermaid, parseMermaid } from '../../utils/mermaid';
import { normalizeAiDiagram } from '../../utils/diagram';
import { shortError } from '../../utils/json';
import {
  SAMPLE_AGENT_WORKFLOW,
  SAMPLE_ASCII_FLOWCHART,
  SAMPLE_LOOP_WORKFLOW,
  SAMPLE_WORKFLOW_TEXT,
} from '../../utils/samples';
import { looksLikeAsciiFlowchart } from '../../utils/asciiFlow';
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
  const [direction, setDirection] = useState<LayoutDirection>('TB');
  const [useAi, setUseAi] = useState(false);

  const mermaid = useMemo(() => isMermaid(text), [text]);
  const ascii = useMemo(() => !mermaid && looksLikeAsciiFlowchart(text), [mermaid, text]);

  const loadLocal = () => {
    const diagram = textToDiagram(text, { direction });
    const title = diagram.title ? `“${diagram.title}” · ` : '';
    onLoadDiagram(
      diagram,
      `${title}${ascii ? 'Rebuilt ASCII diagram' : 'Structured workflow'} into ${diagram.nodes.length} nodes and ${diagram.edges.length} connections.`,
    );
  };

  const runLocal = () => {
    setError('');
    try {
      loadLocal();
    } catch (localError) {
      const message = shortError(localError);
      setError(message);
      onToast(message, 'error');
    }
  };

  const runMermaid = () => {
    setError('');
    try {
      const diagram = parseMermaid(text);
      onLoadDiagram(
        diagram,
        `Converted Mermaid into ${diagram.nodes.length} editable nodes.`,
      );
    } catch (localError) {
      const message = shortError(localError);
      setError(message);
      onToast(message, 'error');
    }
  };

  const runAi = async () => {
    if (!settings.token) {
      onToast('Add a Hugging Face token to use AI structuring, or use the local parser.', 'info');
      onOpenSettings();
      return;
    }
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await structureWorkflowText(settings, text, undefined, direction);
      const { diagram, warnings } = normalizeAiDiagram(result, direction);
      onLoadDiagram(
        diagram,
        warnings[0] ?? `AI structured the workflow into ${diagram.nodes.length} nodes.`,
      );
    } catch (aiError) {
      const message = shortError(aiError);
      try {
        loadLocal();
        onToast('AI was unavailable, so the local parser built the flowchart.', 'info');
      } catch {
        setError(message);
        onToast(message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const primary = () => {
    if (mermaid) {
      runMermaid();
    } else if (useAi && settings.token) {
      void runAi();
    } else {
      runLocal();
    }
  };

  const loadSample = (sample: string) => {
    setText(sample);
    setError('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FileText size={14} />
          <span>Paste text, an ASCII flowchart, or Mermaid</span>
          {mermaid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
              <Code2 size={10} />
              Mermaid detected
            </span>
          )}
          {ascii && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <LayoutTemplate size={10} />
              ASCII flowchart detected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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

      <div>
        <label
          htmlFor="workflow-input"
          className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500"
        >
          Workflow source
        </label>
        <textarea
          id="workflow-input"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError('');
          }}
          rows={11}
          spellCheck={false}
          placeholder="Paste your ChatGPT-generated workflow or flowchart here..."
          className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-[12px] leading-relaxed text-slate-800 shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
          <FlaskConical size={11} />
          Try a sample:
        </span>
        <button
          type="button"
          onClick={() => loadSample(SAMPLE_AGENT_WORKFLOW)}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
        >
          AI agent workflow
        </button>
        <button
          type="button"
          onClick={() => loadSample(SAMPLE_ASCII_FLOWCHART)}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
        >
          Decision flowchart
        </button>
        <button
          type="button"
          onClick={() => loadSample(SAMPLE_LOOP_WORKFLOW)}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
        >
          Loop workflow
        </button>
        <button
          type="button"
          onClick={() => loadSample(SAMPLE_WORKFLOW_TEXT)}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
        >
          Numbered steps
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950/60"
          role="group"
          aria-label="Flowchart direction"
        >
          <button
            type="button"
            onClick={() => setDirection('TB')}
            aria-pressed={direction === 'TB'}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              direction === 'TB'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ArrowDown size={12} />
            Vertical
          </button>
          <button
            type="button"
            onClick={() => setDirection('LR')}
            aria-pressed={direction === 'LR'}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              direction === 'LR'
                ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ArrowRight size={12} />
            Horizontal
          </button>
        </div>

        {settings.token && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(event) => setUseAi(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Use AI for ambiguous text
          </label>
        )}
      </div>

      {!settings.token && !mermaid && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          <Wand2 size={14} className="mt-0.5 shrink-0 text-blue-500" />
          <p>
            The local parser understands ASCII boxes, arrows, numbered steps,
            YES/NO branches, and loops — no account or API key required. Add a
            token only when the wording is too ambiguous for deterministic rules.
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
          {busy ? 'Generating…' : 'Generate Flowchart'}
        </button>

        {mermaid && (
          <button
            type="button"
            onClick={() => onPreviewMermaid(text)}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Preview Mermaid
          </button>
        )}

        {!mermaid && settings.token && !useAi && (
          <button
            type="button"
            onClick={() => void runAi()}
            disabled={!text.trim() || busy}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Refine with AI
          </button>
        )}

        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          Layout: {direction === 'TB' ? 'top to bottom' : 'left to right'} · editable after
          generation
        </span>
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
