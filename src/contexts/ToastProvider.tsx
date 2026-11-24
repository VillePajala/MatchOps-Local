import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationCircle, HiOutlineCheckCircle, HiOutlineInformationCircle } from 'react-icons/hi2';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: ToastAction;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (
    message: string,
    type?: Toast['type'],
    options?: { action?: ToastAction; durationMs?: number },
  ) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Global counter to ensure unique IDs across component remounts
let globalToastCounter = 0;

const toastIcon: Record<Toast['type'], React.ReactNode> = {
  error: <HiOutlineExclamationCircle className="h-5 w-5 text-loss flex-shrink-0" />,
  success: <HiOutlineCheckCircle className="h-5 w-5 text-win flex-shrink-0" />,
  info: <HiOutlineInformationCircle className="h-5 w-5 text-ink-2 flex-shrink-0" />,
};

const toastStyle: Record<Toast['type'], string> = {
  error: 'bg-surface-2 shadow-[inset_0_0_0_1px_rgb(255_107_107/0.45),0_16px_32px_-8px_rgb(12_4_13/0.9)]',
  success: 'bg-surface-2 shadow-[inset_0_0_0_1px_rgb(63_224_140/0.4),0_16px_32px_-8px_rgb(12_4_13/0.9)]',
  info: 'bg-surface-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10),0_16px_32px_-8px_rgb(12_4_13/0.9)]',
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
  }, []);

  // Ref tracks current toasts synchronously so dedup check doesn't rely on
  // side effects inside setState updaters (which React 19 may defer during batching)
  const toastsRef = useRef<Toast[]>(toasts);
  toastsRef.current = toasts;

  const showToast = useCallback((
    message: string,
    type: Toast['type'] = 'success',
    options?: { action?: ToastAction; durationMs?: number },
  ) => {
    // Deduplicate: skip if identical message+type already visible (synchronous ref read)
    if (toastsRef.current.some(toast => toast.message === message && toast.type === type)) {
      return;
    }

    // Create a robust unique ID: timestamp + global counter + random component
    const id = `toast-${Date.now()}-${++globalToastCounter}-${Math.random().toString(36).substring(2, 11)}`;

    // Auto-dismiss: error toasts display longer (5s), others fade faster (3s);
    // callers can override (e.g. an undo toast that needs time to be tapped).
    const durationMs = options?.durationMs ?? (type === 'error' ? 5000 : 3000);

    setToasts(prev => {
      // Cap at 5 visible toasts to prevent accumulation during rapid errors
      const next = [...prev, { id, message, type, action: options?.action, durationMs }];
      return next.length > 5 ? next.slice(-5) : next;
    });

    const timeoutId = setTimeout(() => {
      setToasts(prev => {
        const next = prev.filter(toast => toast.id !== id);
        return next.length === prev.length ? prev : next;
      });
      timeoutRefs.current.delete(id);
    }, durationMs);

    timeoutRefs.current.set(id, timeoutId);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutRefs.current;
    return () => {
      // Clear all pending timeouts when component unmounts
      timeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      timeouts.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* pointer-events-none: confirmations are heavy all around the app and
          must never block the controls underneath them (owner round 7). Only
          toasts the user must be able to TAP - errors (dismiss) and action
          toasts (undo) - opt back in below. */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 space-y-2 z-[100] max-w-sm pointer-events-none" role="log" aria-live="polite" aria-relevant="additions">
        {toasts.map(toast => {
          const interactive = Boolean(toast.action) || toast.type === 'error';
          return (
            <div
              key={toast.id}
              className={`font-ui text-ink pl-4 pr-2 py-2 min-h-12 rounded-2xl animate-fade-in-out flex items-center gap-3 ${interactive ? 'pointer-events-auto' : ''} ${toastStyle[toast.type]}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
              style={{ animationDuration: `${toast.durationMs}ms` }}
            >
              {toastIcon[toast.type]}
              <span className="text-[15px] leading-snug flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
                  className="inline-flex min-h-11 items-center text-[15px] font-semibold text-action hover:brightness-110 px-3 rounded-full hover:bg-white/[0.06] transition-colors flex-shrink-0 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  {toast.action.label}
                </button>
              )}
              {interactive && (
                <button onClick={() => removeToast(toast.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-white/[0.06] transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-action" aria-label={t('common.dismiss', 'Dismiss')}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
};

export default ToastProvider;
