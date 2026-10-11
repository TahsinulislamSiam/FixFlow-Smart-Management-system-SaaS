import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cx } from '../lib/format.js';
import { TONE_CLASSES } from '../lib/constants.js';

const ToastContext = createContext(null);

const ICONS = { ok: '✓', danger: '!', warn: '⚠', info: 'i', brand: '★' };
const ACCENTS = { ok: '#22c55e', danger: '#ef4444', warn: '#f59e0b', info: '#0ea5e9', brand: '#6366f1', neutral: '#6b76b8' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = ++idRef.current;
      const entry = {
        id,
        tone: toast.tone ?? 'info',
        title: toast.title ?? '',
        description: toast.description ?? '',
        timeout: toast.timeout ?? 4200,
      };
      setToasts((current) => [...current.slice(-3), entry]);
      if (entry.timeout > 0) setTimeout(() => dismiss(id), entry.timeout);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ title, description, tone: 'ok' }),
      error: (title, description) => push({ title, description, tone: 'danger', timeout: 6000 }),
      info: (title, description) => push({ title, description, tone: 'info' }),
      warn: (title, description) => push({ title, description, tone: 'warn' }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end">
        <div className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={cx(
                'pointer-events-auto surface surface-raised animate-fade-up flex items-start gap-3 p-3.5',
                'border-l-4',
              )}
              style={{ borderLeftColor: ACCENTS[toast.tone] ?? ACCENTS.neutral }}
            >
              <span
                className={cx(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                  TONE_CLASSES[toast.tone],
                )}
              >
                {ICONS[toast.tone] ?? 'i'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-100">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-xs leading-relaxed text-ink-300">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md px-1.5 text-ink-400 transition hover:bg-white/5 hover:text-ink-200"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
