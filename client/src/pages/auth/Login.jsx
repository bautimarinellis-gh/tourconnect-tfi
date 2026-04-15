import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Alert } from '../../components/ui/Alert';
import './auth.css';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.successMessage || '';

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
    <div className="auth-layout">
      <div className="auth-form-container">
        <div className="auth-form-box">
          <div className="auth-logo">TourConnect</div>
          <h1 className="auth-title">Bienvenido de nuevo</h1>
          <p className="auth-subtitle">Ingrese sus credenciales para acceder a su cuenta</p>

          {successMessage && <Alert variant="success">{successMessage}</Alert>}
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
              <label className="input-label" style={{marginBottom: 0}}>Contraseña</label>
              <Link to="/reset-password" className="auth-link">¿Olvidó su contraseña?</Link>
            </div>
            <PasswordInput
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
      <div className="auth-image-container">
        <div className="auth-image-overlay"></div>
        <img 
          src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2674&auto=format&fit=crop" 
          alt="Travel landscape" 
          className="auth-image"
        />
        <div className="auth-quote">
          <h2>"El mundo es un libro y aquellos que no viajan leen solo una página."</h2>
          <p>— San Agustín</p>
        </div>
      </div>
    </div>
  );
};
