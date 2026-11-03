import { useState } from 'react';
import {
  AlertCircle,
  FlaskConical,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { FlowDiagram } from '../../types/diagram';
import type { HfSettings } from '../../types/hf';
import { normalizeAiDiagram } from '../../utils/diagram';
import { shortError } from '../../utils/json';
import { getSampleDiagram, SAMPLE_PROMPTS } from '../../utils/samples';
import { descriptionToDiagram } from '../../utils/textToFlow';
import { generateDiagramFromPrompt } from '../../services/aiText';
import type { ToastKind } from '../Toast';

interface GenerateTabProps {
  settings: HfSettings;
  onLoadDiagram: (diagram: FlowDiagram, message?: string) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenSettings: () => void;
}

export default function GenerateTab({
  settings,
  onLoadDiagram,
  onToast,
  onOpenSettings,
}: GenerateTabProps) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const runLocal = () => {
    setError('');
    try {
      const diagram = descriptionToDiagram(prompt);
      onLoadDiagram(
        diagram,
        `Generated ${diagram.nodes.length} editable nodes with the local demo generator.`,
      );
    } catch (localError) {
      const message = shortError(localError);
      setError(message);
      onToast(message, 'error');
    }
  };

  const runAi = async () => {
    if (!settings.token) {
      onToast('Add a Hugging Face token to use AI generation, or try the demo generator.', 'info');
      onOpenSettings();
      return;
    }
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await generateDiagramFromPrompt(settings, prompt);
      const { diagram, warnings } = normalizeAiDiagram(result);
      onLoadDiagram(
        diagram,
        warnings[0] ?? `AI generated ${diagram.nodes.length} editable nodes.`,
      );
    } catch (aiError) {
      const message = shortError(aiError);
      setError(message);
      onToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Wand2 size={14} />
          Describe a process in plain language
        </div>
        <button
          type="button"
          onClick={() => {
            const sample = getSampleDiagram('support');
            onLoadDiagram(sample, 'Loaded the support ticket sample diagram.');
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <FlaskConical size={12} />
          Load sample diagram
        </button>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => {
          setPrompt(event.target.value);
          setError('');
        }}
        rows={5}
        placeholder="Example: A user signs in. The system validates their credentials. If valid, they see the dashboard; otherwise they receive an error message."
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
      />

      <div className="flex flex-wrap gap-1.5">
        {SAMPLE_PROMPTS.map((sample, index) => (
          <button
            key={sample}
            type="button"
            onClick={() => {
              setPrompt(sample);
              setError('');
            }}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
            title={sample}
          >
            Example {index + 1}
          </button>
        ))}
      </div>

      {!settings.token && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Sparkles size={14} className="mt-0.5 shrink-0" />
          <p>
            No token? The local demo generator turns your description into an
            editable starting diagram. AI generation produces more nuanced results.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void (settings.token ? runAi() : runLocal())}
          disabled={!prompt.trim() || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} />
          )}
          {busy
            ? 'Generating flowchart…'
            : settings.token
              ? 'Generate with AI'
              : 'Generate demo flowchart'}
        </button>
        {settings.token && (
          <button
            type="button"
            onClick={runLocal}
            disabled={!prompt.trim() || busy}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Try demo generator
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
