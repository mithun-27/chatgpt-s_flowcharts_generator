import { useState } from 'react';
import { ClipboardPaste, UploadCloud, Wand2 } from 'lucide-react';
import type { FlowDiagram } from '../types/diagram';
import type { HfSettings } from '../types/hf';
import type { ToastKind } from './Toast';
import UploadTab from './tabs/UploadTab';
import PasteTab from './tabs/PasteTab';
import GenerateTab from './tabs/GenerateTab';

type InputMode = 'upload' | 'paste' | 'generate';

interface InputPanelProps {
  settings: HfSettings;
  onLoadDiagram: (diagram: FlowDiagram, message?: string) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenSettings: () => void;
  onPreviewMermaid: (code: string) => void;
}

const TABS: Array<{
  id: InputMode;
  label: string;
  hint: string;
  icon: typeof UploadCloud;
}> = [
  {
    id: 'upload',
    label: 'Upload Image',
    hint: 'Screenshot → editable flow',
    icon: UploadCloud,
  },
  {
    id: 'paste',
    label: 'Paste Workflow',
    hint: 'Text or Mermaid',
    icon: ClipboardPaste,
  },
  {
    id: 'generate',
    label: 'Generate with AI',
    hint: 'Describe a process',
    icon: Wand2,
  },
];

export default function InputPanel({
  settings,
  onLoadDiagram,
  onToast,
  onOpenSettings,
  onPreviewMermaid,
}: InputPanelProps) {
  const [mode, setMode] = useState<InputMode>('upload');
  const active = TABS.find((tab) => tab.id === mode) ?? TABS[0];

  return (
    <section className="input-panel rounded-2xl border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900/80">
      <div className="border-b border-slate-200 px-4 pt-4 dark:border-slate-800">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Create a flowchart
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {active.hint}. Everything lands on the editable canvas below.
            </p>
          </div>
          <span className="mb-1 hidden text-[11px] text-slate-400 sm:inline dark:text-slate-500">
            No account required
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Flowchart input methods"
          className="mt-3 flex gap-1 overflow-x-auto pb-px"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === mode;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                aria-controls={`input-panel-${tab.id}`}
                id={`input-tab-${tab.id}`}
                onClick={() => setMode(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition ${
                  selected
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`input-panel-${mode}`}
        role="tabpanel"
        aria-labelledby={`input-tab-${mode}`}
        className="px-4 py-4"
      >
        {mode === 'upload' && (
          <UploadTab
            settings={settings}
            onLoadDiagram={onLoadDiagram}
            onToast={onToast}
            onOpenSettings={onOpenSettings}
          />
        )}
        {mode === 'paste' && (
          <PasteTab
            settings={settings}
            onLoadDiagram={onLoadDiagram}
            onToast={onToast}
            onOpenSettings={onOpenSettings}
            onPreviewMermaid={onPreviewMermaid}
          />
        )}
        {mode === 'generate' && (
          <GenerateTab
            settings={settings}
            onLoadDiagram={onLoadDiagram}
            onToast={onToast}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>
    </section>
  );
}
