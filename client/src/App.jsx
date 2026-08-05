import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { PageWrapper } from './components/layout/PageWrapper';
import { ToastContainer } from './components/ui/Toast';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { Spinner } from './components/ui/Spinner';
import { getDashboardPathForRole } from './utils/roles';

// Auth Pages
import { Login } from './pages/auth/Login';
import { SetPassword } from './pages/auth/SetPassword';
import { ResetPassword } from './pages/auth/ResetPassword';

// Auditoría (compartida por los tres roles)
import { AuditoriaPage } from './pages/auditoria/AuditoriaPage';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminMayoristas } from './pages/admin/Mayoristas';

// Mayorista Pages
import { MayoristaDashboard } from './pages/mayorista/Dashboard';
import { MayoristaAgencias } from './pages/mayorista/Agencias';
import { MayoristaAgenciaDetalle } from './pages/mayorista/AgenciaDetalle';
import { MayoristaProductos } from './pages/mayorista/Productos';
import { MayoristaCotizaciones } from './pages/mayorista/Cotizaciones';
import { MayoristaReservas } from './pages/mayorista/Reservas';
import { MayoristaReservaDetalle } from './pages/mayorista/ReservaDetalle';
import { MayoristaSeguridad } from './pages/mayorista/Seguridad';
import { ConPermiso } from './components/shared/SinPermiso';
import { PERMISO_POR_SECCION as P } from './config/navegacion';

// Agencia Pages
import { AgenciaDashboard } from './pages/agencia/Dashboard';
import { AgenciaCatalogo } from './pages/agencia/Catalogo';
import { AgenciaCotizaciones } from './pages/agencia/Cotizaciones';
import { AgenciaReservas } from './pages/agencia/Reservas';
import { AgenciaReservaDetalle } from './pages/agencia/ReservaDetalle';

const MayoristaReportes = React.lazy(() =>
  import('./pages/mayorista/Reportes').then(m => ({ default: m.MayoristaReportes }))
);

const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getDashboardPathForRole(user.rol)} replace />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastContainer />
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          <Route path="/" element={<RootRedirect />} />

          {/* Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin/*" element={
              <PageWrapper>
                <Routes>
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="mayoristas" element={<AdminMayoristas />} />
                  <Route path="auditoria" element={<AuditoriaPage title="Mi actividad — Administrador" />} />
                </Routes>
              </PageWrapper>
            } />
          </Route>

          {/* Mayorista Routes */}
          <Route element={<ProtectedRoute allowedRoles={['mayorista']} />}>
            <Route path="/mayorista/*" element={
              <PageWrapper>
                {/* El Dashboard no exige permiso: es la home de cualquier
                    usuario autenticado del tenant. El resto se bloquea por
                    contenido — el ítem del menú sigue visible, ocultarlo
                    queda para una fase posterior. */}
                {/* Los códigos salen de config/navegacion.js, la misma tabla
                    que arma el menú, para que ocultar y bloquear no se
                    desincronicen. Las rutas de detalle heredan el permiso de
                    su sección. */}
                <Routes>
                  <Route path="dashboard" element={<MayoristaDashboard />} />
                  <Route path="agencias" element={<ConPermiso codigo={P.agencias}><MayoristaAgencias /></ConPermiso>} />
                  <Route path="agencias/:id" element={<ConPermiso codigo={P.agencias}><MayoristaAgenciaDetalle /></ConPermiso>} />
                  <Route path="productos" element={<ConPermiso codigo={P.productos}><MayoristaProductos /></ConPermiso>} />
                  <Route path="cotizaciones" element={<ConPermiso codigo={P.cotizaciones}><MayoristaCotizaciones /></ConPermiso>} />
                  <Route path="reservas" element={<ConPermiso codigo={P.reservas}><MayoristaReservas /></ConPermiso>} />
                  <Route path="reservas/:id" element={<ConPermiso codigo={P.reservas}><MayoristaReservaDetalle /></ConPermiso>} />
                  <Route path="auditoria" element={<ConPermiso codigo={P.auditoria}><AuditoriaPage title="Mi actividad — Mayorista" /></ConPermiso>} />
                  <Route path="seguridad" element={
                    <ConPermiso codigo={P.seguridad}>
                      <MayoristaSeguridad />
                    </ConPermiso>
                  } />
                  <Route path="reportes" element={
                    <ConPermiso codigo={P.reportes}>
                      <React.Suspense fallback={<Spinner center size="lg" />}>
                        <MayoristaReportes />
                      </React.Suspense>
                    </ConPermiso>
                  } />
                </Routes>
              </PageWrapper>
            } />
          </Route>

          {/* Agencia Routes */}
          <Route element={<ProtectedRoute allowedRoles={['agencia']} />}>
            <Route path="/agencia/*" element={
              <PageWrapper>
                <Routes>
                  <Route path="dashboard" element={<AgenciaDashboard />} />
                  <Route path="catalogo" element={<AgenciaCatalogo />} />
                  <Route path="cotizaciones" element={<AgenciaCotizaciones />} />
                  <Route path="reservas" element={<AgenciaReservas />} />
                  <Route path="reservas/:id" element={<AgenciaReservaDetalle />} />
                  <Route path="auditoria" element={<AuditoriaPage title="Mi actividad — Agencia" />} />
                </Routes>
              </PageWrapper>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ThemeToggle />
      </AuthProvider>
    </Router>
  );
}

export default App;
