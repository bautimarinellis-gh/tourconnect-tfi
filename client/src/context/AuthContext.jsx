import React, { createContext, useState, useCallback, useMemo } from 'react';
import authService from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('tourconnect_user_v1');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem('tourconnect_user_v1');
      return null;
    }
  });

  const login = useCallback(async (email, password) => {
    const response = await authService.login(email, password);
    const userData = { ...response.data.usuario };
    localStorage.setItem('tourconnect_user_v1', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error('Logout failed on server', err);
    } finally {
      localStorage.removeItem('tourconnect_user_v1');
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const value = useMemo(() => ({ user, login, logout, loading: false }), [user, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
