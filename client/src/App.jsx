import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { PageWrapper } from './components/layout/PageWrapper';
import { ToastContainer } from './components/ui/Toast';

// Auth Pages
import { Login } from './pages/auth/Login';
import { SetPassword } from './pages/auth/SetPassword';
import { ResetPassword } from './pages/auth/ResetPassword';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminMayoristas } from './pages/admin/Mayoristas';

// Mayorista Pages
import { MayoristaDashboard } from './pages/mayorista/Dashboard';
import { MayoristaAgencias } from './pages/mayorista/Agencias';
import { MayoristaAgenciaDetalle } from './pages/mayorista/AgenciaDetalle';
import { MayoristaProductos } from './pages/mayorista/Productos';
import { MayoristaCotizaciones } from './pages/mayorista/Cotizaciones';
import { MayoristaReportes } from './pages/mayorista/Reportes';
import { MayoristaReservas } from './pages/mayorista/Reservas';
import { MayoristaReservaDetalle } from './pages/mayorista/ReservaDetalle';

// Agencia Pages
import { AgenciaDashboard } from './pages/agencia/Dashboard';
import { AgenciaCatalogo } from './pages/agencia/Catalogo';
import { AgenciaCotizaciones } from './pages/agencia/Cotizaciones';
import { AgenciaReservas } from './pages/agencia/Reservas';
import { AgenciaReservaDetalle } from './pages/agencia/ReservaDetalle';

const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.rol === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user.rol === 'mayorista') return <Navigate to="/mayorista/dashboard" replace />;
  if (user.rol === 'agencia') return <Navigate to="/agencia/dashboard" replace />;
  return <Navigate to="/login" replace />;
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
                </Routes>
              </PageWrapper>
            } />
          </Route>

          {/* Mayorista Routes */}
          <Route element={<ProtectedRoute allowedRoles={['mayorista']} />}>
            <Route path="/mayorista/*" element={
              <PageWrapper>
                <Routes>
                  <Route path="dashboard" element={<MayoristaDashboard />} />
                  <Route path="agencias" element={<MayoristaAgencias />} />
                  <Route path="agencias/:id" element={<MayoristaAgenciaDetalle />} />
                  <Route path="productos" element={<MayoristaProductos />} />
                  <Route path="cotizaciones" element={<MayoristaCotizaciones />} />
                  <Route path="reservas" element={<MayoristaReservas />} />
                  <Route path="reservas/:id" element={<MayoristaReservaDetalle />} />
                  <Route path="reportes" element={<MayoristaReportes />} />
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
                </Routes>
              </PageWrapper>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
