import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { marcarCierreDeSesion, marcarSesionIniciada } from '../services/api';

export const AuthContext = createContext();

// Ventana mínima entre revalidaciones por foco. Sin esto, alt-tabear varias
// veces seguidas dispara un /auth/me por cada cambio de pestaña.
const REVALIDACION_MIN_MS = 30 * 1000;

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
  const ultimaRevalidacion = useRef(0);

  const login = useCallback(async (email, password) => {
    const response = await authService.login(email, password);
    marcarSesionIniciada();
    const userData = { ...response.data.usuario };
    localStorage.setItem('tourconnect_user_v1', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    // Se marca antes de invalidar el token: a partir de acá los 401 de las
    // requests que hayan quedado en vuelo son esperables y no deben disparar
    // la recarga de página del interceptor.
    marcarCierreDeSesion();
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
          ultimaRevalidacion.current = Date.now();
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

  // Revalida al volver a la pestaña. Los permisos del usuario viajan en este
  // payload, así que si un administrador le cambia el rol mientras tiene la
  // sesión abierta, el menú y los bloqueos se actualizan solos sin recargar.
  // El backend igual decide en cada request: esto sincroniza la UI, no la
  // seguridad.
  useEffect(() => {
    const revalidar = () => {
      if (document.visibilityState !== 'visible') return;
      if (!localStorage.getItem('tourconnect_user_v1')) return;
      if (Date.now() - ultimaRevalidacion.current < REVALIDACION_MIN_MS) return;

      ultimaRevalidacion.current = Date.now();

      authService.getMe()
        .then((res) => {
          const userData = res?.data?.usuario;
          if (!userData) return;
          localStorage.setItem('tourconnect_user_v1', JSON.stringify(userData));
          setUser(userData);
        })
        .catch(() => {
          // Mismo criterio que arriba: lo maneja el interceptor.
        });
    };

    document.addEventListener('visibilitychange', revalidar);
    window.addEventListener('focus', revalidar);
    return () => {
      document.removeEventListener('visibilitychange', revalidar);
      window.removeEventListener('focus', revalidar);
    };
  }, []);

  const value = useMemo(() => ({ user, login, logout, loading }), [user, login, logout, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
