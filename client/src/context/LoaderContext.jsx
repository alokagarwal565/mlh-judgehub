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
            top: 20,
            right: 24,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            background: 'rgba(24, 26, 34, 0.94)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 500,
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            animation: 'appleSelectFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <span
            className="apple-btn-spinner"
            style={{
              width: 15,
              height: 15,
              borderWidth: 2,
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
