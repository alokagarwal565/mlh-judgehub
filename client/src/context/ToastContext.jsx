import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, type, title, message }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const success = useCallback((message, title = 'Success') => toast({ type: 'success', title, message }), [toast]);
  const error = useCallback((message, title = 'Error') => toast({ type: 'error', title, message, duration: 6000 }), [toast]);
  const info = useCallback((message, title = 'Info') => toast({ type: 'info', title, message }), [toast]);
  const loading = useCallback((message, title = 'Loading...') => toast({ type: 'loading', title, message, duration: 0 }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, loading, dismiss }}>
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
  if (type === 'success') return <span style={{fontSize:18}}>✅</span>;
  if (type === 'error') return <span style={{fontSize:18}}>❌</span>;
  if (type === 'loading') return <span className="toast-spinner" />;
  return <span style={{fontSize:18}}>ℹ️</span>;
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-icon"><ToastIcon type={t.type} /></div>
          <div className="toast-body">
            {t.title && <div className="toast-title">{t.title}</div>}
            {t.message && <div className="toast-message">{t.message}</div>}
          </div>
          <button className="toast-close" onClick={() => onDismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
