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
  error: <HiOutlineExclamationCircle className="h-5 w-5 text-red-400 flex-shrink-0" />,
  success: <HiOutlineCheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />,
  info: <HiOutlineInformationCircle className="h-5 w-5 text-slate-300 flex-shrink-0" />,
};

const toastStyle: Record<Toast['type'], string> = {
  error: 'bg-red-950/95 border border-red-700/50',
  success: 'bg-emerald-950/95 border border-emerald-700/50',
  info: 'bg-slate-800/95 border border-slate-600/50',
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
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 space-y-2 z-[100] max-w-sm" role="log" aria-live="polite" aria-relevant="additions">
        {toasts.map(toast => {
          return (
            <div
              key={toast.id}
              className={`text-white pl-3 pr-3 py-3 rounded-lg shadow-lg backdrop-blur-sm animate-fade-in-out flex items-center gap-3 ${toastStyle[toast.type]}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
              style={{ animationDuration: `${toast.durationMs}ms` }}
            >
              {toastIcon[toast.type]}
              <span className="text-sm flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
                  className="text-sm font-semibold text-sky-300 hover:text-sky-200 px-2 py-1 rounded hover:bg-white/10 transition-colors flex-shrink-0 whitespace-nowrap"
                >
                  {toast.action.label}
                </button>
              )}
              <button onClick={() => removeToast(toast.id)} className="p-1 rounded hover:bg-white/20 transition-colors flex-shrink-0" aria-label={t('common.dismiss', 'Dismiss')}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
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
