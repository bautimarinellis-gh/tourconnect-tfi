import React, { createContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
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
  const [loading, setLoading] = useState(true);

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
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // Revalida la sesión contra el backend al montar. Si no hay un usuario
  // guardado en localStorage, no hay nada que revalidar: no llamamos a la
  // API. Esto es intencional — evita pegarle a /auth/me en cada visita
  // anónima a /login, /set-password o /reset-password, donde SIEMPRE
  // devolvería 401 y el interceptor de api.js redirige a /login ante
  // cualquier 401 fuera de /auth/login. Sin este guard, un visitante sin
  // sesión en /login entraría en un loop de recarga infinita.
  useEffect(() => {
    // Se lee localStorage directamente (no el estado `user`) para que este
    // efecto no dependa de `user` y así corra una sola vez, al montar.
    if (!localStorage.getItem('tourconnect_user_v1')) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    authService.getMe()
      .then((res) => {
        if (cancelled) return;
        const userData = res?.data?.usuario;
        if (userData) {
          localStorage.setItem('tourconnect_user_v1', JSON.stringify(userData));
          setUser(userData);
        }
      })
      .catch(() => {
        // 401/403: el interceptor de api.js ya limpia localStorage y
        // redirige a /login. No hace falta duplicar esa lógica acá.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ user, login, logout, loading }), [user, login, logout, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
