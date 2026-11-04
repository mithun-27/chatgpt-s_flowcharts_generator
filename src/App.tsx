import { useCallback, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { FlowDiagram } from './types/diagram';
import { DEFAULT_HF_SETTINGS, type HfSettings } from './types/hf';
import { createInitialDiagram } from './utils/samples';
import { generateMermaid } from './utils/mermaid';
import { useDiagram } from './editor/useDiagram';
import Header from './components/Header';
import InputPanel from './components/InputPanel';
import EditorShell from './components/EditorShell';
import TokenDialog from './components/TokenDialog';
import MermaidDialog from './components/MermaidDialog';
import Toast, { type ToastKind, type ToastMessage } from './components/Toast';

const INITIAL_DIAGRAM = createInitialDiagram();

export default function App() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );
  const [settings, setSettings] = useState<HfSettings>(DEFAULT_HF_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [mermaidCode, setMermaidCode] = useState('');
  const [fitRequest, setFitRequest] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const {
    diagram,
    canUndo,
    canRedo,
    updateDiagram,
    commitDiagram,
    beginTransaction,
    endTransaction,
    undo,
    redo,
  } = useDiagram(INITIAL_DIAGRAM);

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ id: Date.now(), message, kind });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const toggleTheme = () => {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      try {
        localStorage.setItem('fc-theme', next ? 'dark' : 'light');
      } catch {
        /* Persisting the theme is optional. */
      }
      return next;
    });
  };

  const loadDiagram = useCallback(
    (next: FlowDiagram, message?: string) => {
      commitDiagram(next);
      setFitRequest((value) => value + 1);
      if (message) showToast(message, 'success');
      window.setTimeout(() => {
        document.getElementById('editor')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 120);
    },
    [commitDiagram, showToast],
  );

  const openMermaid = useCallback(
    (code: string) => {
      setMermaidCode(code.trim() ? code : generateMermaid(diagram));
      setMermaidOpen(true);
    },
    [diagram],
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header
        dark={dark}
        onToggleTheme={toggleTheme}
        hasToken={Boolean(settings.token)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
            Screenshot · Text · Mermaid
          </span>
          <ArrowRight size={12} className="text-slate-300 dark:text-slate-600" />
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
            Editable React Flow diagram
          </span>
          <ArrowRight size={12} className="text-slate-300 dark:text-slate-600" />
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
            PNG · SVG · PDF · Mermaid · JSON
          </span>
        </div>

        <InputPanel
          settings={settings}
          onLoadDiagram={loadDiagram}
          onToast={showToast}
          onOpenSettings={() => setSettingsOpen(true)}
          onPreviewMermaid={openMermaid}
        />

        <EditorShell
          diagram={diagram}
          settings={settings}
          canUndo={canUndo}
          canRedo={canRedo}
          updateDiagram={updateDiagram}
          commitDiagram={commitDiagram}
          beginTransaction={beginTransaction}
          endTransaction={endTransaction}
          undo={undo}
          redo={redo}
          onToast={showToast}
          onOpenMermaid={openMermaid}
          onOpenSettings={() => setSettingsOpen(true)}
          fitRequest={fitRequest}
        />

      </main>

      <TokenDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          setSettings(next);
          showToast(
            next.token
              ? 'AI connected. The token stays in memory for this browser tab.'
              : 'Token cleared. Demo mode is active.',
            next.token ? 'success' : 'info',
          );
        }}
      />

      <MermaidDialog
        open={mermaidOpen}
        initialCode={mermaidCode}
        dark={dark}
        onClose={() => setMermaidOpen(false)}
        onApplyDiagram={(next) => {
          loadDiagram(next, `Applied Mermaid as ${next.nodes.length} editable nodes.`);
        }}
      />

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
