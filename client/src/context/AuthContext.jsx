import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { clearJudgeCache } from '../services/idb';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data);
          try {
            localStorage.setItem('cached_user', JSON.stringify(res.data));
          } catch {
            // Quota or storage error
          }
        })
        .catch((err) => {
          // ponytail: Only invalidate session on explicit 401. Flaky Wi-Fi/offline must NOT wipe credentials.
          if (err.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('cached_user');
            setToken(null);
            setUser(null);
          } else {
            console.warn('[Auth] Network unreachable; preserving offline judge session');
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    try {
      localStorage.setItem('cached_user', JSON.stringify(res.data.user));
    } catch {
      // Storage error
    }
    api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('cached_user');
    delete api.defaults.headers.common['Authorization'];
    try {
      await clearJudgeCache();
    } catch (err) {
      console.error('[Auth] Failed to clear offline cache on logout', err);
    }
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
