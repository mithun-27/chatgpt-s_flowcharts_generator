import { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Bot,
  GitBranch,
  Loader2,
  MessageSquareText,
  Scissors,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { FlowDiagram } from '../types/diagram';
import type { HfSettings } from '../types/hf';
import { normalizeAiDiagram } from '../utils/diagram';
import { shortError } from '../utils/json';
import { diagramToSummary } from '../utils/diagram';
import {
  addDecisionBranch,
  addErrorHandlingStep,
  setDiagramDirection,
  simplifyDiagram,
} from '../utils/localEdits';
import { explainDiagramWithAi, modifyDiagramWithAi } from '../services/aiText';
import type { ToastKind } from './Toast';

interface AssistantPanelProps {
  diagram: FlowDiagram;
  settings: HfSettings;
  onCommitDiagram: (diagram: FlowDiagram) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenSettings: () => void;
}

const QUICK_ACTIONS = [
  { label: 'Horizontal', instruction: 'Make this flowchart horizontal.', icon: ArrowRight },
  { label: 'Vertical', instruction: 'Make this flowchart vertical.', icon: ArrowDown },
  { label: 'Add error step', instruction: 'Add an error-handling step.', icon: ShieldAlert },
  { label: 'Add decision', instruction: 'Add a decision branch.', icon: GitBranch },
  { label: 'Simplify', instruction: 'Simplify this workflow.', icon: Scissors },
  { label: 'Explain', instruction: 'Explain this flowchart.', icon: MessageSquareText },
];

export default function AssistantPanel({
  diagram,
  settings,
  onCommitDiagram,
  onToast,
  onOpenSettings,
}: AssistantPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'local' | 'ai' | null>(null);

  const runLocalEdit = (text: string): boolean => {
    const value = text.toLowerCase();

    if (/\bexplain\b|\bsummar(y|ize)\b|\bdescribe\b/.test(value)) {
      setExplanation(diagramToSummary(diagram));
      setMethod('local');
      setError('');
      return true;
    }

    if (/\bhorizontal\b|\blandscape\b|\bleft to right\b/.test(value)) {
      onCommitDiagram(setDiagramDirection(diagram, 'LR'));
      onToast('Applied horizontal layout.', 'success');
      return true;
    }

    if (/\bvertical\b|\bportrait\b|\btop to bottom\b/.test(value)) {
      onCommitDiagram(setDiagramDirection(diagram, 'TB'));
      onToast('Applied vertical layout.', 'success');
      return true;
    }

    if (/\berror\b|\bexception\b|\bfailure\b/.test(value)) {
      const result = addErrorHandlingStep(diagram);
      onCommitDiagram(result.diagram);
      onToast(result.message, 'success');
      return true;
    }

    if (/\bdecision\b|\bbranch\b/.test(value)) {
      const result = addDecisionBranch(diagram);
      onCommitDiagram(result.diagram);
      onToast(result.message, 'success');
      return true;
    }

    if (/\bsimplif(y|ied)\b|\bclean up\b/.test(value)) {
      const result = simplifyDiagram(diagram);
      onCommitDiagram(result.diagram);
      onToast(result.message, result.diagram === diagram ? 'info' : 'success');
      return true;
    }

    return false;
  };

  const run = async (rawInstruction: string) => {
    const text = rawInstruction.trim();
    if (!text || busy) return;
    setInstruction(text);
    setError('');
    setExplanation('');

    if (runLocalEdit(text)) {
      setInstruction('');
      return;
    }

    if (!settings.token) {
      onToast(
        'That instruction needs AI. Try a quick action (layout, branch, simplify, explain) or add a token.',
        'info',
      );
      onOpenSettings();
      return;
    }

    setBusy(true);
    try {
      if (/\bexplain\b|\bsummar(y|ize)\b|\bdescribe\b/i.test(text)) {
        const result = await explainDiagramWithAi(settings, diagram);
        setExplanation(result);
        setMethod('ai');
      } else {
        const result = await modifyDiagramWithAi(settings, diagram, text);
        const { diagram: next, warnings } = normalizeAiDiagram(result, diagram.direction);
        onCommitDiagram(next);
        onToast(warnings[0] ?? 'AI updated the diagram.', 'success');
        setMethod('ai');
      }
      setInstruction('');
    } catch (assistantError) {
      const message = shortError(assistantError);
      setError(message);
      onToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
            <Bot size={14} />
          </span>
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            AI assistant
          </h3>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              settings.token
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {settings.token ? 'HF AI' : 'Demo'}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Local quick actions work without a token
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => void run(action.instruction)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-violet-800 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
            >
              <Icon size={11} />
              {action.label}
            </button>
          );
        })}
      </div>

      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(instruction);
        }}
      >
        <div className="relative flex-1">
          <Sparkles
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={
              settings.token
                ? 'Ask AI to change or explain this flowchart…'
                : 'Try: make it horizontal, add an error-handling step, explain…'
            }
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={!instruction.trim() || busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
          <span className="hidden sm:inline">{busy ? 'Working…' : 'Send'}</span>
        </button>
      </form>

      {(explanation || error) && (
        <div className="mt-2 grid gap-2">
          {explanation && (
            <div className="relative rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  Flowchart explanation · {method === 'ai' ? 'AI' : 'local'}
                </span>
                <button
                  type="button"
                  onClick={() => setExplanation('')}
                  className="rounded p-0.5 text-violet-400 hover:text-violet-700 dark:hover:text-violet-200"
                  aria-label="Dismiss explanation"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="max-h-40 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {explanation}
              </p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
