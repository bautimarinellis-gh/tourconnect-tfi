import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Alert } from '../../components/ui/Alert';
import { AuthBackground } from '../../components/shared/AuthBackground';
import './auth.css';
import logoImg from '/logo.png';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.successMessage || '';
  const [authMessage] = useState(() => {
    const stored = sessionStorage.getItem('tourconnect_auth_message');
    if (stored) sessionStorage.removeItem('tourconnect_auth_message');
    return stored || '';
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Por favor complete todos los campos.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.rol === 'admin') navigate('/admin/dashboard');
      else if (user.rol === 'mayorista') navigate('/mayorista/dashboard');
      else if (user.rol === 'agencia') navigate('/agencia/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.mensaje || 'Error al iniciar sesión. Verifique sus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout single-col">
      <AuthBackground />
      <div className="auth-form-container">
        <div className="auth-form-box">
          <img src={logoImg} alt="TourConnect" className="auth-logo-img center auth-logo-hero-lg" />
          <h1 className="auth-title">Bienvenido de nuevo</h1>
          <p className="auth-subtitle">Ingrese sus credenciales para acceder a su cuenta</p>

          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          {authMessage && <Alert variant="error">{authMessage}</Alert>}
          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@ejemplo.com"
            />
            <div className="password-header">
              <label className="input-label" htmlFor="login-password" style={{marginBottom: 0}}>Contraseña</label>
              <Link to="/reset-password" className="auth-link">¿Olvidó su contraseña?</Link>
            </div>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{marginTop: '0.375rem'}}
            />

            <Button type="submit" className="w-full" size="lg" isLoading={loading}>
              Iniciar Sesión
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
