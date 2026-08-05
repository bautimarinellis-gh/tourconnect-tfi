import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../ui/Spinner';
import { getDashboardPathForRole } from '../../utils/roles';
import { SinPermiso } from './SinPermiso';

/**
 * @param {string[]} [allowedRoles]     Ámbitos habilitados (admin/mayorista/agencia).
 *   Separa los tres lados del negocio; no es control de permisos.
 * @param {string[]} [requiredPermiso]  Permisos que habilitan la ruta. Alcanza
 *   con tener alguno. Si falta, se bloquea el contenido en vez de redirigir:
 *   redirigir haría parecer que la sección no existe.
 */
export const ProtectedRoute = ({ allowedRoles, requiredPermiso }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.rol)) {
    // Redirect according to correct role when trespassing
    return <Navigate to={getDashboardPathForRole(user.rol)} replace />;
  }

  if (requiredPermiso) {
    const permisos = user.permisos ?? [];
    const codigos = Array.isArray(requiredPermiso) ? requiredPermiso : [requiredPermiso];
    if (!codigos.some(codigo => permisos.includes(codigo))) {
      return <SinPermiso />;
    }
  }

  return <Outlet />;
};
