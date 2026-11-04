import { GitFork, Moon, Settings2, Sun, Workflow } from 'lucide-react';

interface HeaderProps {
  dark: boolean;
  onToggleTheme: () => void;
  hasToken: boolean;
  onOpenSettings: () => void;
}

const GITHUB_URL =
  'https://github.com/mithun-27/chatgpt-s_flowcharts_generator';

export default function Header({
  dark,
  onToggleTheme,
  hasToken,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/20">
            <Workflow size={21} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white">
              ChatGPT&apos;s Flowcharts Generator
            </h1>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm dark:text-slate-400">
              Turn screenshots, workflow text, or Mermaid into clean, editable
              flowcharts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              hasToken
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
            }`}
            title="Configure settings"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                hasToken ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {hasToken ? 'Connected' : 'Demo'}
            <Settings2 size={13} />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <GitFork size={15} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
