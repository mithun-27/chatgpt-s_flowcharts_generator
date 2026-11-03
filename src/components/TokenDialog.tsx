import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import type { HfSettings } from '../types/hf';
import { DEFAULT_HF_SETTINGS } from '../types/hf';
import Modal from './Modal';

interface TokenDialogProps {
  open: boolean;
  settings: HfSettings;
  onClose: () => void;
  onSave: (settings: HfSettings) => void;
}

export default function TokenDialog({
  open,
  settings,
  onClose,
  onSave,
}: TokenDialogProps) {
  const [token, setToken] = useState(settings.token);
  const [textModel, setTextModel] = useState(settings.textModel);
  const [visionModel, setVisionModel] = useState(settings.visionModel);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setToken(settings.token);
    setTextModel(settings.textModel);
    setVisionModel(settings.visionModel);
    setShowToken(false);
    setError('');
  }, [open, settings]);

  const save = () => {
    const trimmed = token.trim();
    if (trimmed && !trimmed.startsWith('hf_')) {
      setError('Hugging Face access tokens normally start with "hf_". Check that you copied the whole token.');
      return;
    }
    onSave({
      token: trimmed,
      textModel: textModel.trim() || DEFAULT_HF_SETTINGS.textModel,
      visionModel: visionModel.trim() || DEFAULT_HF_SETTINGS.visionModel,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI settings"
      description="Optional Hugging Face access for screenshot understanding, AI generation, and AI edits."
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <div className="flex items-start gap-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <p>
              The token stays in this browser tab&apos;s memory only. It is never
              written to localStorage, bundled into the app, or committed to the
              repository. Refreshing the page clears it.
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="hf-token"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Hugging Face access token
          </label>
          <div className="relative">
            <KeyRound
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="hf-token"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="hf_..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => setShowToken((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label={showToken ? 'Hide token' : 'Show token'}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Leave empty to use demo mode. Create a fine-grained token with{' '}
            <a
              href="https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
            >
              Inference Providers permission
            </a>
            . Inference usage may require Hugging Face credits.
          </p>
          {error && (
            <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>

        <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
            Model settings
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label
                htmlFor="text-model"
                className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Text / reasoning model
              </label>
              <input
                id="text-model"
                value={textModel}
                onChange={(event) => setTextModel(event.target.value)}
                spellCheck={false}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="vision-model"
                className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Vision model for screenshots
              </label>
              <input
                id="vision-model"
                value={visionModel}
                onChange={(event) => setVisionModel(event.target.value)}
                spellCheck={false}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Defaults: text <code>openai/gpt-oss-20b</code>, vision{' '}
              <code>Qwen/Qwen3-VL-30B-A3B-Instruct</code>. Any chat-completions
              model available through Hugging Face Inference Providers can be used.
            </p>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              setToken('');
              setError('');
            }}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-rose-600 hover:underline dark:text-slate-400"
          >
            Clear token
          </button>
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
              onClick={save}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Sparkles size={15} />
              Save settings
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
