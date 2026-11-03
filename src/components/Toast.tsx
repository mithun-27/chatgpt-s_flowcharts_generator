import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, toast.kind === 'error' ? 6500 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const Icon =
    toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info;

  return (
    <div
      key={toast.id}
      role="status"
      className="toast-enter fixed bottom-5 right-5 z-[60] flex max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <Icon
        size={18}
        className={
          toast.kind === 'success'
            ? 'mt-0.5 shrink-0 text-emerald-500'
            : toast.kind === 'error'
              ? 'mt-0.5 shrink-0 text-rose-500'
              : 'mt-0.5 shrink-0 text-blue-500'
        }
      />
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="ml-1 rounded p-0.5 text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
