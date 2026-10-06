import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from '../components/ui/icons';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = 'info', title, message, duration = 4000 }) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const success = useCallback((message, title = 'Success') => toast({ type: 'success', title, message }), [toast]);
  const error = useCallback((message, title = 'Error') => toast({ type: 'error', title, message, duration: 6000 }), [toast]);
  const warning = useCallback((message, title = 'Warning') => toast({ type: 'warning', title, message, duration: 5000 }), [toast]);
  const info = useCallback((message, title = 'Notice') => toast({ type: 'info', title, message }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastIcon({ type }) {
  if (type === 'success') return <CheckCircle2 size={18} style={{ color: 'var(--accent-success)' }} />;
  if (type === 'error') return <XCircle size={18} style={{ color: 'var(--accent-danger)' }} />;
  if (type === 'warning') return <AlertTriangle size={18} style={{ color: 'var(--accent-warning)' }} />;
  return <Info size={18} style={{ color: 'var(--accent)' }} />;
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-icon">
            <ToastIcon type={t.type} />
          </div>
          <div className="toast-body">
            {t.title && <div className="toast-title">{t.title}</div>}
            {t.message && <div className="toast-message">{t.message}</div>}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
