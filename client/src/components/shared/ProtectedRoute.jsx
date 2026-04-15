import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../ui/Spinner';

export const ProtectedRoute = ({ allowedRoles }) => {
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
    if (user.rol === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (user.rol === 'mayorista') return <Navigate to="/mayorista/dashboard" replace />;
    if (user.rol === 'agencia') return <Navigate to="/agencia/dashboard" replace />;
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
