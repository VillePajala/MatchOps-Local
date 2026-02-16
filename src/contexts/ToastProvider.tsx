import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationCircle, HiOutlineCheckCircle, HiOutlineInformationCircle } from 'react-icons/hi2';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void;
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

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    // Create a robust unique ID: timestamp + global counter + random component
    const id = `toast-${Date.now()}-${++globalToastCounter}-${Math.random().toString(36).substring(2, 11)}`;

    let wasAdded = false;
    setToasts(prev => {
      // Deduplicate: skip if identical message+type already visible
      if (prev.some(toast => toast.message === message && toast.type === type)) {
        return prev;
      }
      wasAdded = true;
      // Cap at 5 visible toasts to prevent accumulation during rapid errors
      const next = [...prev, { id, message, type }];
      return next.length > 5 ? next.slice(-5) : next;
    });

    // Only create timeout if toast was actually added (skip for deduped toasts)
    if (!wasAdded) return;

    // Store timeout reference for potential cleanup
    // Error toasts display longer (5s) to ensure users see them, others fade faster (3s)
    const duration = type === 'error' ? 5000 : 3000;
    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
      timeoutRefs.current.delete(id);
    }, duration);

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
          const duration = toast.type === 'error' ? 5 : 3;
          return (
            <div
              key={toast.id}
              className={`text-white pl-3 pr-3 py-3 rounded-lg shadow-lg backdrop-blur-sm animate-fade-in-out flex items-center gap-3 ${toastStyle[toast.type]}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
              style={{ animationDuration: `${duration}s` }}
            >
              {toastIcon[toast.type]}
              <span className="text-sm flex-1">{toast.message}</span>
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
