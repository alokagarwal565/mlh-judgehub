import { createContext, useContext, useState, useCallback } from 'react';

const LoaderContext = createContext(null);

export function LoaderProvider({ children }) {
  const [state, setState] = useState({ visible: false, message: '' });

  const showLoader = useCallback((message = 'Processing...') => {
    setState({ visible: true, message });
  }, []);

  const hideLoader = useCallback(() => {
    setState({ visible: false, message: '' });
  }, []);

  return (
    <LoaderContext.Provider value={{ showLoader, hideLoader }}>
      {children}
      {state.visible && (
        <div className="global-loader-overlay">
          <div className="global-loader-box">
            <div className="global-loader-spinner" />
            <div className="global-loader-message">{state.message}</div>
          </div>
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
