import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  undoAction?: () => void;
}

interface ToastContextValue {
  addToast: (
    message: string,
    options?: {
      type?: Toast['type'];
      undoAction?: () => void;
      duration?: number;
    },
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (
      message: string,
      options?: {
        type?: Toast['type'];
        undoAction?: () => void;
        duration?: number;
      },
    ) => {
      const id = crypto.randomUUID();
      const toast: Toast = {
        id,
        message,
        type: options?.type ?? 'info',
        undoAction: options?.undoAction,
      };
      setToasts((prev) => [...prev, toast]);
      const timer = setTimeout(() => {
        removeToast(id);
      }, options?.duration ?? 5000);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div data-testid="toast-region" className="fixed bottom-22 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role="alert"
              data-testid="toast"
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 typo-body shadow-lg ${
                toast.type === 'error'
                  ? 'bg-error text-white'
                  : 'bg-g40 light:bg-l60 text-(--text-primary)'
              }`}
            >
              <span>{toast.message}</span>
              {toast.undoAction && (
                <button
                  data-testid="toast-undo-btn"
                  onClick={() => {
                    toast.undoAction?.();
                    removeToast(toast.id);
                  }}
                  className="font-medium underline underline-offset-2 hover:no-underline"
                >
                  Undo
                </button>
              )}
              <button
                data-testid="toast-dismiss-btn"
                onClick={() => removeToast(toast.id)}
                className="ml-1 opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
