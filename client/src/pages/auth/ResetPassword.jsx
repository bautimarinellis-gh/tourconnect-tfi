import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Alert } from '../../components/ui/Alert';
import authService from '../../services/authService';
import './auth.css';

export const ResetPassword = () => {
  const [email, setEmail] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const passwordsNoCoinciden =
    confirmarPassword.length > 0 && nuevaPassword !== confirmarPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !nuevaPassword || !confirmarPassword) {
      setError('Por favor complete todos los campos.');
      return;
    }

    if (nuevaPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPasswordSimple(email, nuevaPassword);
      navigate('/login', {
        state: { successMessage: 'Contraseña actualizada. Ya puedes iniciar sesión.' },
      });
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.mensaje ||
          'Error al actualizar la contraseña. Intente nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-form-container">
        <div className="auth-form-box">
          <div className="auth-logo">TourConnect</div>
          <h1 className="auth-title">Resetear contraseña</h1>
          <p className="auth-subtitle">Ingresa tu email y tu nueva contraseña</p>

          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit} className="auth-form">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@ejemplo.com"
            />

            <PasswordInput
              label="Nueva contraseña"
              value={nuevaPassword}
              onChange={(e) => setNuevaPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />

            <div>
              <PasswordInput
                label="Confirmar contraseña"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Repetir contraseña"
              />
              {passwordsNoCoinciden && (
                <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Las contraseñas no coinciden.
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" isLoading={loading}>
              Actualizar contraseña
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
            <Link to="/login" className="auth-link">
              Volver al login
            </Link>
          </p>
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
