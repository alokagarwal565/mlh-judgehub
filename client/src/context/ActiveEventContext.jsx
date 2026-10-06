import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const ActiveEventContext = createContext();

export function ActiveEventProvider({ children }) {
  const [activeEvent, setActiveEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshActiveEvent = async () => {
    try {
      const res = await api.get('/events');
      const active = res.data.find(e => e.isActive);
      setActiveEvent(active || null);
    } catch (err) {
      console.error('Failed to fetch active event', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshActiveEvent();
  }, []);

  return (
    <ActiveEventContext.Provider value={{ activeEvent, setActiveEvent, refreshActiveEvent, loading }}>
      {children}
    </ActiveEventContext.Provider>
  );
}

export const useActiveEvent = () => useContext(ActiveEventContext);
