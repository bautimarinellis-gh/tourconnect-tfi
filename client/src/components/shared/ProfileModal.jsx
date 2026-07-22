import React, { useState, useEffect } from 'react';
import { Shield, Mail, Phone, KeyRound } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PasswordInput } from '../ui/PasswordInput';
import { Alert } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';
import { useToast } from '../ui/Toast';
import authService from '../../services/authService';

const ROLE_LABEL = {
  admin: 'Administrador',
  mayorista: 'Mayorista',
  agencia: 'Agencia',
};

export const ProfileModal = ({ isOpen, onClose }) => {
  const toast = useToast();
  const [perfil, setPerfil] = useState(null);
  const [loadingPerfil, setLoadingPerfil] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const resetPasswordForm = () => {
    setShowPasswordForm(false);
    setPasswordActual('');
    setPasswordNueva('');
    setPasswordConfirmar('');
    setPasswordError('');
  };

  useEffect(() => {
    if (!isOpen) return;
    resetPasswordForm();
    setLoadingPerfil(true);
    authService.getMe()
      .then(res => setPerfil(res?.data?.usuario ?? null))
      .catch(() => setPerfil(null))
      .finally(() => setLoadingPerfil(false));
  }, [isOpen]);

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!passwordActual || !passwordNueva || !passwordConfirmar) {
      setPasswordError('Completá todos los campos.');
      return;
    }
    if (passwordNueva.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setPasswordSaving(true);
    try {
      await authService.changePassword(passwordActual, passwordNueva);
      toast.success('Contraseña actualizada correctamente.');
      resetPasswordForm();
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Error al cambiar la contraseña.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const roleLabel = ROLE_LABEL[perfil?.rol] || 'Usuario';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mi Perfil">
      {loadingPerfil ? (
        <Spinner center />
      ) : !perfil ? (
        <Alert variant="error">No se pudo cargar la información del perfil.</Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginBottom: '0.125rem' }}>Nombre</div>
              <div style={{ fontWeight: 500 }}>{perfil.nombre || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginBottom: '0.125rem' }}>
                <Mail size={12} style={{ verticalAlign: '-1px', marginRight: '0.25rem' }} />Email
              </div>
              <div>{perfil.email}</div>
            </div>
            {perfil.telefono && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginBottom: '0.125rem' }}>
                  <Phone size={12} style={{ verticalAlign: '-1px', marginRight: '0.25rem' }} />Teléfono
                </div>
                <div>{perfil.telefono}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginBottom: '0.25rem' }}>Rol</div>
              <Badge variant="info"><Shield size={12} style={{ verticalAlign: '-1px', marginRight: '0.25rem' }} />{roleLabel}</Badge>
            </div>
          </div>

          <div className="dropdown-divider" style={{ margin: 0 }}></div>

          {!showPasswordForm ? (
            <Button variant="ghost" onClick={() => setShowPasswordForm(true)}>
              <KeyRound size={16} /> Cambiar contraseña
            </Button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {passwordError && <Alert variant="error">{passwordError}</Alert>}
              <PasswordInput label="Contraseña actual" value={passwordActual} onChange={e => setPasswordActual(e.target.value)} />
              <PasswordInput label="Nueva contraseña (mín. 8 caracteres)" value={passwordNueva} onChange={e => setPasswordNueva(e.target.value)} />
              <PasswordInput label="Confirmar nueva contraseña" value={passwordConfirmar} onChange={e => setPasswordConfirmar(e.target.value)} />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={resetPasswordForm}>Cancelar</Button>
                <Button onClick={handleChangePassword} isLoading={passwordSaving}>Guardar contraseña</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
