import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';

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

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    // Create a robust unique ID: timestamp + global counter + random component
    const id = `toast-${Date.now()}-${++globalToastCounter}-${Math.random().toString(36).substring(2, 11)}`;

    setToasts(prev => {
      // Cap at 5 visible toasts to prevent accumulation during rapid errors
      const next = [...prev, { id, message, type }];
      return next.length > 5 ? next.slice(-5) : next;
    });

    // Store timeout reference for potential cleanup
    // Error toasts display longer (5s) to ensure users see them, others fade faster (3s)
    const duration = type === 'error' ? 5000 : 3000;
    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
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
      <div className="fixed top-4 right-4 space-y-2 z-[100]">
        {toasts.map(t => {
          const base = 'text-white px-4 py-2 rounded shadow animate-fade-in-out';
          const color =
            t.type === 'error'
              ? 'bg-red-600'
              : t.type === 'info'
                ? 'bg-slate-600'
                : 'bg-green-600';
          return (
            <div key={t.id} className={`${base} ${color}`}>{t.message}</div>
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
