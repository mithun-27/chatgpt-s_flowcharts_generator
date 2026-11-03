import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ClipboardPaste,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type { FlowDiagram } from '../../types/diagram';
import type { HfSettings } from '../../types/hf';
import { normalizeAiDiagram } from '../../utils/diagram';
import { shortError } from '../../utils/json';
import {
  downscaleDataUrl,
  readFileAsDataUrl,
  validateImageFile,
} from '../../utils/file';
import {
  SAMPLE_SCREENSHOT_URL,
  SUPPORT_TICKET_SAMPLE,
} from '../../utils/samples';
import { extractDiagramFromImage } from '../../services/vision';
import type { ToastKind } from '../Toast';

interface UploadTabProps {
  settings: HfSettings;
  onLoadDiagram: (diagram: FlowDiagram, message?: string) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenSettings: () => void;
}

interface SelectedImage {
  dataUrl: string;
  name: string;
  meta: string;
  isSample: boolean;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export default function UploadTab({
  settings,
  onLoadDiagram,
  onToast,
  onOpenSettings,
}: UploadTabProps) {
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const acceptFile = useCallback(
    async (file: File) => {
      try {
        setError('');
        validateImageFile(file);
        const dataUrl = await readFileAsDataUrl(file);
        setImage({
          dataUrl,
          name: file.name,
          meta: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          isSample: false,
        });
      } catch (fileError) {
        const message = shortError(fileError);
        setError(message);
        onToast(message, 'error');
      }
    },
    [onToast],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      void acceptFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptFile]);

  const loadSample = () => {
    setError('');
    setImage({
      dataUrl: SAMPLE_SCREENSHOT_URL,
      name: 'support-ticket-flow.png',
      meta: 'Sample screenshot',
      isSample: true,
    });
    onToast('Sample screenshot loaded. Analyze it to reconstruct the diagram.', 'info');
  };

  const analyze = async () => {
    if (!image || busy) return;
    setError('');

    if (!settings.token) {
      if (image.isSample) {
        setBusy(true);
        await wait(700);
        const { diagram } = normalizeAiDiagram(SUPPORT_TICKET_SAMPLE);
        onLoadDiagram(
          diagram,
          'Demo extraction loaded. Add a Hugging Face token to analyze your own screenshots.',
        );
        setBusy(false);
        return;
      }
      onToast(
        'Screenshot understanding needs a Hugging Face token. Try the sample screenshot or use the other input tabs.',
        'info',
      );
      onOpenSettings();
      return;
    }

    setBusy(true);
    try {
      let source = image.dataUrl;
      if (image.isSample) {
        const response = await fetch(image.dataUrl);
        if (!response.ok) throw new Error('Could not load the sample image.');
        const blob = await response.blob();
        source = await readFileAsDataUrl(
          new File([blob], 'sample.png', { type: blob.type || 'image/png' }),
        );
      }

      const prepared = await downscaleDataUrl(source);
      const result = await extractDiagramFromImage(settings, prepared.dataUrl);
      const { diagram, warnings } = normalizeAiDiagram(result);
      onLoadDiagram(
        diagram,
        warnings[0] ??
          `Reconstructed ${diagram.nodes.length} editable nodes from the screenshot.`,
      );
    } catch (analyzeError) {
      const message = shortError(analyzeError);
      setError(message);
      onToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!settings.token && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Sparkles size={15} className="mt-0.5 shrink-0" />
          <p>
            Vision AI is optional. The sample screenshot still works as a
            reconstruction demo; your own uploads need a Hugging Face token.
          </p>
        </div>
      )}

      {image ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex min-w-0 items-center gap-2">
              <ImageIcon size={15} className="shrink-0 text-slate-400" />
              <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                {image.name}
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">
                {image.meta}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setImage(null);
                setError('');
              }}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Remove image"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex max-h-72 items-center justify-center bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%,#f1f5f9),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%,#f1f5f9)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] p-3 dark:bg-slate-900">
            <img
              src={image.dataUrl}
              alt="Flowchart screenshot preview"
              className="max-h-64 max-w-full rounded-md object-contain shadow-sm"
            />
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void acceptFile(file);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-10 text-center transition ${
            dragging
              ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-blue-500 dark:hover:bg-slate-900'
          }`}
        >
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
            <UploadCloud size={22} />
          </span>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Drop a flowchart screenshot here
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            or click to browse · PNG, JPG, JPEG, WEBP (max 10 MB)
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ClipboardPaste size={12} />
            Ctrl + V to paste
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void acceptFile(file);
          event.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={!image || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {busy ? 'Analyzing screenshot…' : 'Analyze screenshot'}
        </button>
        <button
          type="button"
          onClick={loadSample}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Try sample screenshot
        </button>
        {image && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Choose another
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        The screenshot is never used as the output image. It is analyzed into
        nodes and edges, then re-rendered as an editable React Flow diagram.
      </p>
    </div>
  );
}
