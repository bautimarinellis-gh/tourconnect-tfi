import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Alert } from '../../components/ui/Alert';
import { AuthBackground } from '../../components/shared/AuthBackground';
import authService from '../../services/authService';
import './auth.css';
import logoImg from '/logo.png';

const PASOS = {
  EMAIL: 'email',
  CODIGO: 'codigo',
  PASSWORD: 'password',
};

const SUBTITULOS = {
  [PASOS.EMAIL]: 'Ingresá tu email y te enviaremos un código de verificación',
  [PASOS.CODIGO]: 'Ingresá el código de 6 dígitos que te enviamos por email',
  [PASOS.PASSWORD]: 'Creá tu nueva contraseña',
};

export const ResetPassword = () => {
  const [paso, setPaso] = useState(PASOS.EMAIL);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const navigate = useNavigate();

  const passwordsNoCoinciden =
    confirmarPassword.length > 0 && nuevaPassword !== confirmarPassword;

  const handleEnviarCodigo = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!email) {
      setError('Por favor ingresá tu email.');
      return;
    }

    setLoading(true);
    try {
      await authService.forgotPassword(email);
      // La respuesta es genérica exista o no el email (anti-enumeración):
      // siempre avanzamos al paso del código.
      setInfo('Si el email existe, vas a recibir un código de verificación.');
      setPaso(PASOS.CODIGO);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Error al enviar el código. Intentá nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReenviarCodigo = async () => {
    setError('');
    setInfo('');
    setCodigo('');
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setInfo('Si el email existe, vas a recibir un nuevo código.');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Error al reenviar el código. Intentá nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerificarCodigo = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (codigo.length !== 6) {
      setError('El código debe tener 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const response = await authService.verifyResetCode(email, codigo);
      setResetToken(response.data.reset_token);
      setPaso(PASOS.PASSWORD);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Código inválido o expirado.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuardarPassword = async (e) => {
    e.preventDefault();
    setError('');

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
      await authService.resetPassword(resetToken, nuevaPassword);
      navigate('/login', {
        state: { successMessage: 'Contraseña actualizada. Ya puedes iniciar sesión.' },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Error al actualizar la contraseña. Intente nuevamente.'
      );
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
          <h1 className="auth-title">Resetear contraseña</h1>
          <p className="auth-subtitle">{SUBTITULOS[paso]}</p>

          {error && <Alert variant="error">{error}</Alert>}
          {info && !error && <Alert variant="info">{info}</Alert>}

          {paso === PASOS.EMAIL && (
            <form onSubmit={handleEnviarCodigo} className="auth-form">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
              />
              <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                Enviar código
              </Button>
            </form>
          )}

          {paso === PASOS.CODIGO && (
            <form onSubmit={handleVerificarCodigo} className="auth-form">
              <Input
                label="Código de verificación"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
              />
              <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                Verificar código
              </Button>
              <p style={{ textAlign: 'center', fontSize: '0.875rem' }}>
                ¿No recibiste el código?{' '}
                <button
                  type="button"
                  className="auth-link"
                  onClick={handleReenviarCodigo}
                  disabled={loading}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Reenviar código
                </button>
              </p>
            </form>
          )}

          {paso === PASOS.PASSWORD && (
            <form onSubmit={handleGuardarPassword} className="auth-form">
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
                  <p style={{ color: 'var(--color-error, #ef4444)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Las contraseñas no coinciden.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                Actualizar contraseña
              </Button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
            <Link to="/login" className="auth-link">
              Volver al login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
