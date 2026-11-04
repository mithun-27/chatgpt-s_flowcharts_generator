import { useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  GitBranch,
  GitMerge,
  Layers,
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
import { layoutDiagramBest } from '../editor/elkLayout';
import { addDecisionBranch } from '../utils/localEdits';
import { explainDiagramWithAi, modifyDiagramWithAi } from '../services/aiText';
import {
  addAgentArchitecture,
  addAlternativePath,
  addDetailStep,
  addExceptionHandling,
  addMissingDependencies,
  addParallelExecution,
  explainDiagramLocally,
  setDirectionEdit,
  simplifyLocal,
  type LocalEditResult,
} from '../intelligence/assistantEdits';
import type { ToastKind } from './Toast';

interface AssistantPanelProps {
  diagram: FlowDiagram;
  settings: HfSettings;
  onCommitDiagram: (diagram: FlowDiagram) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenSettings: () => void;
}

interface Preview {
  diagram: FlowDiagram;
  title: string;
  message: string;
  source: 'local' | 'ai';
  warnings: string[];
}

const QUICK_ACTIONS = [
  { label: 'Down', instruction: 'Make this flowchart vertical, top to bottom.', icon: ArrowDown },
  { label: 'Right', instruction: 'Make this flowchart horizontal, left to right.', icon: ArrowRight },
  { label: 'Up', instruction: 'Make this flowchart go bottom to top.', icon: ArrowUp },
  { label: 'Left', instruction: 'Make this flowchart go right to left.', icon: ArrowLeft },
  { label: 'Detail', instruction: 'Add more detail.', icon: Layers },
  { label: 'Missing steps', instruction: 'Find missing steps and dependencies.', icon: GitMerge },
  { label: 'Exception', instruction: 'Add exception handling.', icon: ShieldAlert },
  { label: 'Agents', instruction: 'Add an agent architecture.', icon: Bot },
  { label: 'Parallel', instruction: 'Add parallel execution.', icon: GitBranch },
  { label: 'Alternatives', instruction: 'Add an alternative path.', icon: GitBranch },
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
  const [preview, setPreview] = useState<Preview | null>(null);

  const stage = (result: LocalEditResult, source: 'local' | 'ai' = 'local') => {
    if (!result.changed) {
      onToast(result.message, 'info');
      return;
    }
    setPreview({
      diagram: result.diagram,
      title: result.title,
      message: result.message,
      source,
      warnings: [],
    });
  };

  const runLocalEdit = async (text: string): Promise<boolean> => {
    const value = text.toLowerCase();

    if (/\bexplain\b|\bsummar(y|ize)\b|\bdescribe\b|\bwalk me through\b|\bwhat does\b/.test(value)) {
      setExplanation(explainDiagramLocally(diagram));
      setMethod('local');
      setError('');
      return true;
    }

    if (/\bhorizontal\b|\blandscape\b|\bleft to right\b|\bside by side\b/.test(value)) {
      stage(await setDirectionEdit(diagram, 'LR'));
      return true;
    }
    if (/\bvertical\b|\bportrait\b|\btop to bottom\b|\bdownward\b/.test(value)) {
      stage(await setDirectionEdit(diagram, 'TB'));
      return true;
    }
    if (/\bbottom to top\b|\bupward\b|\bbottom-up\b/.test(value)) {
      stage(await setDirectionEdit(diagram, 'BT'));
      return true;
    }
    if (/\bright to left\b|\bright-to-left\b/.test(value)) {
      stage(await setDirectionEdit(diagram, 'RL'));
      return true;
    }
    if (/\bparallel\b|\bsimultaneous\b|\bconcurrent\b|\bat the same time\b/.test(value)) {
      stage(await addParallelExecution(diagram));
      return true;
    }
    if (
      /\bmissing\b|\bdependency\b|\bdependencies\b|\bunlinked\b|\bdisconnected\b|\bdead end\b|\borphan\b/.test(
        value,
      )
    ) {
      stage(await addMissingDependencies(diagram));
      return true;
    }
    if (/\bagent\b|\bmulti-agent\b|\borchestrator\b|\bworker\b/.test(value)) {
      stage(await addAgentArchitecture(diagram));
      return true;
    }
    if (/\balternative\b|\belse branch\b|\bother option\b|\bfallback\b/.test(value)) {
      stage(await addAlternativePath(diagram));
      return true;
    }
    if (/\bdetail\b|\belaborate\b|\bexpand\b|\bbreak down\b|\bmore steps?\b/.test(value)) {
      stage(await addDetailStep(diagram));
      return true;
    }
    if (/\berror\b|\bexception\b|\bfailure\b|\bretry\b/.test(value)) {
      stage(addExceptionHandling(diagram));
      return true;
    }
    if (/\bdecision\b|\bbranch\b/.test(value)) {
      const result = addDecisionBranch(diagram);
      stage({
        diagram: result.diagram,
        message: result.message,
        changed: result.diagram !== diagram,
        title: 'Decision branch',
      });
      return true;
    }
    if (/\bsimplif(y|ied)\b|\bclean up\b|\breduce\b/.test(value)) {
      stage(simplifyLocal(diagram));
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
    setPreview(null);
    setBusy(true);

    try {
      if (await runLocalEdit(text)) {
        setInstruction('');
        return;
      }

      if (!settings.token) {
        onToast(
          'That instruction needs AI. Try a quick action (layout, detail, branches, simplify, explain) or add a token.',
          'info',
        );
        onOpenSettings();
        return;
      }

      if (/\bexplain\b|\bsummar(y|ize)\b|\bdescribe\b/i.test(text)) {
        const result = await explainDiagramWithAi(settings, diagram);
        setExplanation(result);
        setMethod('ai');
      } else {
        const result = await modifyDiagramWithAi(settings, diagram, text);
        const { diagram: next, warnings } = normalizeAiDiagram(result, diagram.direction);
        const laidOut = await layoutDiagramBest(next, next.direction);
        setPreview({
          diagram: laidOut,
          title: 'AI change',
          message:
            warnings[0] ??
            `AI prepared ${laidOut.nodes.length} nodes and ${laidOut.edges.length} connections. Review before applying.`,
          source: 'ai',
          warnings: warnings.slice(1),
        });
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

  const acceptPreview = () => {
    if (!preview) return;
    onCommitDiagram(preview.diagram);
    onToast(preview.message, 'success');
    setPreview(null);
  };

  const discardPreview = () => {
    setPreview(null);
    onToast('Discarded the preview. The diagram is unchanged.', 'info');
  };

  const deltaNodes = preview ? preview.diagram.nodes.length - diagram.nodes.length : 0;
  const deltaEdges = preview ? preview.diagram.edges.length - diagram.edges.length : 0;

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
            <Bot size={14} />
          </span>
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Flow assistant
          </h3>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              settings.token
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {settings.token ? 'AI + local' : 'Local'}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Graph-aware actions · preview before applying
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
                : 'Try: add detail, find missing steps, add parallel work, explain…'
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

      {preview && (
        <div className="mt-2 rounded-lg border border-violet-300 bg-violet-50/70 px-3 py-2.5 dark:border-violet-800 dark:bg-violet-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              <GitMerge size={12} />
              Preview · {preview.title}
              <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-violet-600 dark:bg-violet-900/60 dark:text-violet-200">
                {preview.source === 'ai' ? 'AI' : 'local'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={discardPreview}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600 dark:border-violet-800 dark:bg-slate-950 dark:text-slate-300"
              >
                <X size={11} />
                Discard
              </button>
              <button
                type="button"
                onClick={acceptPreview}
                className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-violet-700"
              >
                <Check size={11} />
                Apply
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
            {preview.message}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            {deltaNodes === 0 ? 'No node change' : `${deltaNodes > 0 ? '+' : ''}${deltaNodes} node${Math.abs(deltaNodes) === 1 ? '' : 's'}`}
            {' · '}
            {deltaEdges === 0 ? 'no connection change' : `${deltaEdges > 0 ? '+' : ''}${deltaEdges} connection${Math.abs(deltaEdges) === 1 ? '' : 's'}`}
            {' · '}
            {preview.diagram.nodes.length} nodes total
          </p>
          {preview.warnings.length > 0 && (
            <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
              {preview.warnings.join(' ')}
            </p>
          )}
        </div>
      )}

      {(explanation || error) && (
        <div className="mt-2 grid gap-2">
          {explanation && (
            <div className="relative rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  Graph explanation · {method === 'ai' ? 'AI' : 'local'}
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
              <p className="max-h-48 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-200">
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
