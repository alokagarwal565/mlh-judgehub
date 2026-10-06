import React, { createContext, useContext, useState, useCallback } from 'react';

const LoaderContext = createContext(null);

export function LoaderProvider({ children }) {
  const [state, setState] = useState({ visible: false, message: '' });

  const showLoader = useCallback((message = 'Loading...') => {
    setState({ visible: true, message });
  }, []);

  const hideLoader = useCallback(() => {
    setState({ visible: false, message: '' });
  }, []);

  return (
    <LoaderContext.Provider value={{ showLoader, hideLoader }}>
      {children}
      {state.visible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 18,
            right: 24,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            background: 'var(--material-glass)',
            backdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-pill)',
            boxShadow: 'var(--shadow-md)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 500,
            color: 'var(--text-primary)',
            pointerEvents: 'none'
          }}
        >
          <span
            className="apple-btn-spinner"
            style={{
              width: 14,
              height: 14,
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderTopColor: 'var(--accent)'
            }}
          />
          <span>{state.message}</span>
        </div>
      )}
    </LoaderContext.Provider>
  );
}

export function useLoader() {
  const ctx = useContext(LoaderContext);
  if (!ctx) throw new Error('useLoader must be used within LoaderProvider');
  return ctx;
}
