import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Alert } from '../../components/ui/Alert';
import authService from '../../services/authService';
import './auth.css';

export const SetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Token inválido o no proporcionado.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await authService.setPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al configurar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-layout single-col">
        <div className="auth-form-box text-center">
          <div className="auth-logo center">TourConnect</div>
          <Alert variant="success" title="¡Contraseña configurada!">
            Su contraseña ha sido configurada exitosamente. Será redirigido al inicio de sesión.
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-layout single-col">
      <div className="auth-form-box">
        <div className="auth-logo center">TourConnect</div>
        <h1 className="auth-title text-center">Configurar Contraseña</h1>
        <p className="auth-subtitle text-center">Ingrese una nueva contraseña para su cuenta</p>

        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} className="auth-form">
          <PasswordInput
            label="Nueva Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            label="Confirmar Contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <Button type="submit" className="w-full" size="lg" isLoading={loading}>
            Guardar Contraseña
          </Button>
        </form>
      </div>
    </div>
  );
};
