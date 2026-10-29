import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePrefersReducedMotion } from './Motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'حذف',
  cancelLabel = 'إلغاء',
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/75 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 ${reduced ? '' : 'animate-fade-in'}`}
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative overflow-hidden bg-dark-elevate border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl shadow-black/50 ${reduced ? '' : 'animate-modal-in'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 inset-x-0 h-0.5 bg-rose-500/50" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white leading-snug">{title}</h2>
              {description && (
                <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{description}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-3 bg-dark border border-dark-border text-gray-300 hover:text-white hover:border-gray-500 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              autoFocus
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
            >
              {busy && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {busy ? 'جارٍ التنفيذ…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    // Drawn on document.body, like every dialog, so an animating page section cannot
    // capture its fixed position.
    document.body
  );
}
