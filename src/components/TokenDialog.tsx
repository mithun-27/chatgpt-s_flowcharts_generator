import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Server, ShieldCheck, Sparkles } from 'lucide-react';
import type { AiProvider, HfSettings } from '../types/hf';
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
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [token, setToken] = useState(settings.token);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [textModel, setTextModel] = useState(settings.textModel);
  const [visionModel, setVisionModel] = useState(settings.visionModel);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProvider(settings.provider);
    setToken(settings.token);
    setBaseUrl(settings.baseUrl);
    setTextModel(settings.textModel);
    setVisionModel(settings.visionModel);
    setShowToken(false);
    setError('');
  }, [open, settings]);

  const save = () => {
    const trimmed = token.trim();
    const url = baseUrl.trim();
    if (provider === 'huggingface' && trimmed && !trimmed.startsWith('hf_')) {
      setError('Hugging Face access tokens normally start with "hf_". Check that you copied the whole token.');
      return;
    }
    if (provider === 'openai-compatible' && trimmed && !url) {
      setError('Add the OpenAI-compatible base URL, for example https://api.openai.com/v1.');
      return;
    }
    if (url && !/^https?:\/\//i.test(url)) {
      setError('The base URL must start with http:// or https://.');
      return;
    }
    onSave({
      provider,
      token: trimmed,
      baseUrl: url,
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
      description="Optional access for deeper reasoning, AI edits and screenshot understanding."
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
            htmlFor="ai-provider"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Provider
          </label>
          <select
            id="ai-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as AiProvider)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="huggingface">Hugging Face Inference Providers</option>
            <option value="openai-compatible">OpenAI-compatible endpoint</option>
          </select>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Model ids are configurable, so Qwen, Llama, GPT-OSS or any chat-completions
            model can be used. Availability and pricing are controlled by the provider.
          </p>
        </div>

        <div>
          <label
            htmlFor="hf-token"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            {provider === 'huggingface' ? 'Hugging Face access token' : 'API key'}
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
              placeholder={provider === 'huggingface' ? 'hf_...' : 'sk-...'}
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
            Leave empty to use local mode.{' '}
            {provider === 'huggingface' && (
              <>
                Create a fine-grained token with{' '}
                <a
                  href="https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
                >
                  Inference Providers permission
                </a>
                . Inference usage may require Hugging Face credits.
              </>
            )}
          </p>
          {error && (
            <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="base-url"
            className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Base URL
          </label>
          <div className="relative">
            <Server
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={
                provider === 'huggingface'
                  ? 'https://router.huggingface.co/v1 (default)'
                  : 'https://api.openai.com/v1'
              }
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Any endpoint that implements <code>/chat/completions</code> works. Leave
            empty to use the provider default.
          </p>
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
              <code>Qwen/Qwen3-VL-30B-A3B-Instruct</code>. Environment variables
              <code> VITE_AI_PROVIDER</code>, <code>VITE_AI_BASE_URL</code>,{' '}
              <code>VITE_TEXT_MODEL</code> and <code>VITE_VISION_MODEL</code> can
              override them at build time.
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
