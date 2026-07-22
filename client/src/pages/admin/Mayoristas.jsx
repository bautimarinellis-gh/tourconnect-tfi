import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, KeyRound, Search, History, AlertTriangle } from 'lucide-react';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { useToast } from '../../components/ui/Toast';
import mayoristaService from '../../services/mayoristaService';
import { formatCuit, isValidCuit } from '../../utils/cuit';
import { formatTelefono } from '../../utils/telefono';
import { HistorialEstadoPersonaTimeline } from '../../components/shared/HistorialEstadoPersonaTimeline';

const SUBSCRIPTION_PLANS = [
  { value: 'Starter', label: 'Starter', description: 'Hasta 20 agencias' },
  { value: 'Professional', label: 'Professional', description: '21 a 100 agencias' },
  { value: 'Enterprise', label: 'Enterprise', description: 'Más de 100 agencias' },
];

const MOTIVOS_DESACTIVACION = [
  { value: 'incumplimiento_pago', label: 'Incumplimiento de pago' },
  { value: 'incumplimiento_terminos', label: 'Incumplimiento de términos y condiciones' },
  { value: 'inactividad', label: 'Inactividad prolongada' },
  { value: 'solicitud_mayorista', label: 'Solicitud del propio mayorista' },
  { value: 'otro', label: 'Otro' },
];

const PLAN_BADGE_VARIANT = { Starter: 'info', Professional: 'success', Enterprise: 'warning' };

const SubscriptionPlanSelect = ({ label, value, onChange }) => (
  <div className="input-group">
    <label className="input-label">{label}</label>
    <select className="input-control" value={value} onChange={onChange}>
      {SUBSCRIPTION_PLANS.map(plan => (
        <option key={plan.value} value={plan.value}>
          {plan.label} - {plan.description}
        </option>
      ))}
    </select>
  </div>
);

const getErrorMessage = (err, fallback) => {
  const data = err?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.join(' ');
  }
  return data?.message || data?.mensaje || fallback;
};

export const AdminMayoristas = () => {
  const toast = useToast();
  const [mayoristas, setMayoristas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMayorista, setEditingMayorista] = useState(null);
  const [editFormData, setEditFormData] = useState({ nombre: '', razon_social: '', telefono: '', cuit: '', plan_suscripcion: 'Starter' });
  const [deletingMayorista, setDeletingMayorista] = useState(null);
  const [deleteMotivo, setDeleteMotivo] = useState('');
  const [deleteMensaje, setDeleteMensaje] = useState('');
  const [deleteVerifying, setDeleteVerifying] = useState(false);
  const [deleteVerification, setDeleteVerification] = useState(null); // { puede_desactivar, cotizaciones_activas, reservas_activas }
  const [reactivandoMayorista, setReactivandoMayorista] = useState(null);
  const [historialMayorista, setHistorialMayorista] = useState(null);
  const [historialData, setHistorialData] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [activarUsuarioMayorista, setActivarUsuarioMayorista] = useState(null);
  const [activarPassword, setActivarPassword] = useState('');
  const [formData, setFormData] = useState({
    nombre: '', razon_social: '', cuit: '', plan_suscripcion: 'Starter', email_contacto: '', telefono: '', admin_nombre: '', admin_email: ''
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showFormError = (message) => {
    setFormError(message);
    toast.error(message);
  };

  const fetchMayoristas = async () => {
    setLoading(true);
    try {
      const data = await mayoristaService.getAll();
      setMayoristas(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMayoristas();
  }, []);

  const mayoristasFiltrados = busqueda.trim()
    ? mayoristas.filter(m =>
      m.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.razon_social?.toLowerCase().includes(busqueda.toLowerCase())
    )
    : mayoristas;

  const handleCreate = async () => {
    setFormError('');
    if (!formData.nombre || !formData.cuit || !formData.admin_email) {
      showFormError('Nombre, CUIT y email del administrador son obligatorios.');
      return;
    }
    if (!isValidCuit(formData.cuit)) {
      showFormError('El CUIT debe tener el formato XX-XXXXXXXX-X (11 dígitos).');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: formData.nombre,
        razon_social: formData.razon_social || formData.nombre,
        telefono: formData.telefono || undefined,
        cuit: formData.cuit,
        plan_suscripcion: formData.plan_suscripcion,
        email: formData.admin_email,
        nombre_usuario: formData.admin_nombre || formData.admin_email.split('@')[0],
      };
      await mayoristaService.create(payload);
      setIsModalOpen(false);
      setFormData({ nombre: '', razon_social: '', cuit: '', plan_suscripcion: 'Starter', email_contacto: '', telefono: '', admin_nombre: '', admin_email: '' });
      fetchMayoristas();
      toast.success('Mayorista creado. Se le envió un email de invitación para configurar su contraseña.');
    } catch (err) {
      showFormError(getErrorMessage(err, 'Error al crear mayorista'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m) => {
    setEditingMayorista(m);
    setEditFormData({
      nombre: m.nombre || '',
      razon_social: m.razon_social || '',
      telefono: m.telefono || '',
      cuit: m.cuit || '',
      plan_suscripcion: m.plan_suscripcion || 'Starter',
    });
    setFormError('');
  };

  const handleUpdate = async () => {
    if (!editingMayorista) return;
    setFormError('');
    if (!editFormData.nombre) {
      showFormError('El nombre es obligatorio.');
      return;
    }
    if (!isValidCuit(editFormData.cuit)) {
      showFormError('El CUIT debe tener el formato XX-XXXXXXXX-X (11 dígitos).');
      return;
    }
    setSaving(true);
    try {
      await mayoristaService.update(editingMayorista._id, {
        nombre: editFormData.nombre,
        razon_social: editFormData.razon_social?.trim() || editFormData.nombre,
        telefono: editFormData.telefono || null,
        cuit: editFormData.cuit,
        plan_suscripcion: editFormData.plan_suscripcion,
      });
      setEditingMayorista(null);
      fetchMayoristas();
      toast.success('Mayorista actualizado.');
    } catch (err) {
      showFormError(getErrorMessage(err, 'Error al actualizar mayorista'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m) => {
    setDeletingMayorista(m);
    setDeleteMotivo('');
    setDeleteMensaje('');
    setFormError('');
    setDeleteVerification(null);
    setDeleteVerifying(true);
    try {
      const verificacion = await mayoristaService.verificarDesactivacion(m._id);
      setDeleteVerification(verificacion);
    } catch {
      setDeleteVerification(null);
    } finally {
      setDeleteVerifying(false);
    }
  };

  const handleVerHistorial = async (m) => {
    setHistorialMayorista(m);
    setHistorialData([]);
    setHistorialLoading(true);
    try {
      const data = await mayoristaService.historial(m._id);
      setHistorialData(data);
    } catch {
      setHistorialData([]);
    } finally {
      setHistorialLoading(false);
    }
  };

  const handleOpenReactivar = (m) => {
    setReactivandoMayorista(m);
    setFormError('');
  };

  const handleReactivar = async () => {
    if (!reactivandoMayorista) return;
    setFormError('');
    setSaving(true);
    try {
      await mayoristaService.reactivar(reactivandoMayorista._id);
      setReactivandoMayorista(null);
      fetchMayoristas();
      toast.success('Mayorista reactivado. Se le notificó por email.');
    } catch (err) {
      showFormError(getErrorMessage(err, 'Error al reactivar mayorista'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarActivarUsuario = async () => {
    if (!activarUsuarioMayorista) return;
    if (!activarPassword || activarPassword.trim().length < 8) {
      showFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await mayoristaService.activarUsuario(activarUsuarioMayorista._id, activarPassword);
      setActivarUsuarioMayorista(null);
      setActivarPassword('');
      fetchMayoristas();
      toast.success('Usuario activado. Ya puede iniciar sesión.');
    } catch (err) {
      showFormError(getErrorMessage(err, 'Error al activar usuario'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingMayorista) return;
    setFormError('');
    if (deleteVerification && !deleteVerification.puede_desactivar) {
      showFormError('No se puede desactivar: existen operaciones activas en sus agencias.');
      return;
    }
    if (!deleteMotivo) {
      showFormError('Seleccioná un motivo de desactivación.');
      return;
    }
    if (deleteMotivo === 'otro' && !deleteMensaje.trim()) {
      showFormError('Especificá un mensaje para el motivo "Otro".');
      return;
    }
    setSaving(true);
    try {
      await mayoristaService.delete(deletingMayorista._id, { motivo: deleteMotivo, mensaje: deleteMensaje.trim() });
      setDeletingMayorista(null);
      fetchMayoristas();
      toast.success('Mayorista desactivado. Se le notificó el motivo por email.');
    } catch (err) {
      showFormError(getErrorMessage(err, 'Error al eliminar mayorista'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mayoristas</h1>
        <Button onClick={() => { setIsModalOpen(true); setFormError(''); }}>
          <Plus size={16} /> Nuevo Mayorista
        </Button>
      </div>

      {mayoristas.length === 0 ? (
        <EmptyState
          title="No hay mayoristas"
          description="Comienza creando el primer mayorista en la plataforma."
          action={<Button onClick={() => { setIsModalOpen(true); setFormError(''); }}>Crear Mayorista</Button>}
        />
      ) : (
        <Card>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Search size={15} style={{ color: 'var(--color-text-soft)', flexShrink: 0 }} />
            <input
              type="text"
              aria-label="Buscar mayorista"
              placeholder="Buscar por nombre o razón social..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.875rem', color: 'var(--color-text)', fontFamily: 'var(--font-family)' }}
            />
          </div>
          {mayoristasFiltrados.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>
              Sin resultados para "{busqueda}".
            </div>
          ) : (
            <Table>
              <thead>
                <TableRow>
                  <TableCell isHeader>Nombre</TableCell>
                  <TableCell isHeader>Razón Social</TableCell>
                  <TableCell isHeader>Plan</TableCell>
                  <TableCell isHeader>Estado</TableCell>
                  <TableCell isHeader>Acciones</TableCell>
                </TableRow>
              </thead>
              <tbody>
                {mayoristasFiltrados.map(m => {
                  const sinAcceso = !m.usuario_id || m.usuario_id.activo !== true;
                  return (
                    <TableRow key={m._id}>
                      <TableCell>
                        <div style={{ fontWeight: 500 }}>{m.nombre}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.125rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
                            {m.usuario_id?.email ?? m.email_contacto ?? '-'}
                          </span>
                          {sinAcceso && (
                            <Badge variant="warning" style={{ fontSize: '0.65rem' }}>Sin acceso</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{m.razon_social || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={PLAN_BADGE_VARIANT[m.plan_suscripcion] ?? 'info'}>
                          {m.plan_suscripcion || 'Starter'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.activo ? 'success' : 'error'}>{m.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(m)} title="Editar"><Edit2 size={16} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleVerHistorial(m)} title="Ver historial"><History size={16} /></Button>
                        {sinAcceso && m.usuario_id && (
                          <Button variant="ghost" size="sm" onClick={() => { setActivarUsuarioMayorista(m); setActivarPassword(''); setFormError(''); }} title="Configurar contraseña"><KeyRound size={16} /></Button>
                        )}
                        {m.activo ? (
                          <Button variant="ghost" size="sm" className="text-danger" onClick={() => handleDelete(m)} title="Desactivar"><Trash2 size={16} /></Button>
                        ) : (
                          <Button variant="ghost" size="sm" style={{ color: 'var(--color-success)' }} onClick={() => handleOpenReactivar(m)} title="Reactivar"><RefreshCw size={16} /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Nuevo Mayorista"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} isLoading={saving}>Guardar Mayorista</Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}

        <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Datos de la Empresa</h4>
        <Input label="Nombre" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
        <Input label="Razón Social" value={formData.razon_social} onChange={e => setFormData({ ...formData, razon_social: e.target.value })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input label="CUIT *" value={formData.cuit} onChange={e => setFormData({ ...formData, cuit: formatCuit(e.target.value) })} placeholder="20-12345678-9" maxLength={13} />
          <SubscriptionPlanSelect label="Plan de suscripción" value={formData.plan_suscripcion} onChange={e => setFormData({ ...formData, plan_suscripcion: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input label="Email de Contacto" type="email" value={formData.email_contacto} onChange={e => setFormData({ ...formData, email_contacto: e.target.value })} />
          <Input label="Teléfono" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: formatTelefono(e.target.value) })} placeholder="1122334455" />
        </div>

        <h4 style={{ margin: '1.5rem 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Usuario Administrador</h4>
        <Input label="Nombre del Administrador *" value={formData.admin_nombre} onChange={e => setFormData({ ...formData, admin_nombre: e.target.value })} />
        <Input label="Email del Administrador (Login) *" type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} />
        <Alert variant="info">
          Se le enviará un email a esta dirección con un link para que configure su propia contraseña.
        </Alert>
      </Modal>

      <Modal
        isOpen={!!editingMayorista}
        onClose={() => { setEditingMayorista(null); setFormError(''); }}
        title="Editar Mayorista"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setEditingMayorista(null); setFormError(''); }}>Cancelar</Button>
            <Button onClick={handleUpdate} isLoading={saving}>Guardar Cambios</Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input label="Nombre de Fantasía *" value={editFormData.nombre} onChange={e => setEditFormData({ ...editFormData, nombre: e.target.value })} />
          <Input label="Razón Social" value={editFormData.razon_social} onChange={e => setEditFormData({ ...editFormData, razon_social: e.target.value })} />
          <Input label="CUIT *" value={editFormData.cuit} onChange={e => setEditFormData({ ...editFormData, cuit: formatCuit(e.target.value) })} placeholder="20-12345678-9" maxLength={13} />
          <SubscriptionPlanSelect label="Plan de suscripción" value={editFormData.plan_suscripcion} onChange={e => setEditFormData({ ...editFormData, plan_suscripcion: e.target.value })} />
          <Input label="Teléfono" value={editFormData.telefono} onChange={e => setEditFormData({ ...editFormData, telefono: formatTelefono(e.target.value) })} placeholder="1122334455" />
        </div>
      </Modal>

      <Modal
        isOpen={!!activarUsuarioMayorista}
        onClose={() => { setActivarUsuarioMayorista(null); setActivarPassword(''); setFormError(''); }}
        title="Configurar contraseña"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setActivarUsuarioMayorista(null); setActivarPassword(''); setFormError(''); }}>Cancelar</Button>
            <Button onClick={handleConfirmarActivarUsuario} isLoading={saving}>Guardar contraseña</Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        {activarUsuarioMayorista && (
          <>
            <p style={{ marginBottom: '1rem' }}>
              El usuario <strong>{activarUsuarioMayorista.usuario_id?.email}</strong> no puede iniciar sesión. Configurá una contraseña para activar la cuenta.
            </p>
            <PasswordInput label="Nueva contraseña (mín. 8 caracteres)" value={activarPassword} onChange={e => setActivarPassword(e.target.value)} />
          </>
        )}
      </Modal>

      <Modal
        isOpen={!!deletingMayorista}
        onClose={() => { setDeletingMayorista(null); setFormError(''); }}
        title="Desactivar Mayorista"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDeletingMayorista(null); setFormError(''); }}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              isLoading={saving || deleteVerifying}
              disabled={deleteVerifying || (deleteVerification && !deleteVerification.puede_desactivar)}
            >
              Desactivar
            </Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        {deletingMayorista && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0 }}>
              ¿Estás seguro de que deseas desactivar <strong>{deletingMayorista.nombre}</strong>?
            </p>
            <Alert variant="warning">
              Se desactivarán también todas sus agencias y el usuario administrador asociado.
            </Alert>

            {deleteVerifying && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>
                <Spinner size="sm" /> Verificando operaciones activas...
              </div>
            )}

            {deleteVerification && !deleteVerification.puede_desactivar && (
              <Alert variant="error">
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
                  <div>
                    <strong>No se puede desactivar</strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                      Sus agencias tienen operaciones activas:{' '}
                      {deleteVerification.cotizaciones_activas > 0 && (
                        <span>{deleteVerification.cotizaciones_activas} cotización{deleteVerification.cotizaciones_activas !== 1 ? 'es' : ''} pendiente{deleteVerification.cotizaciones_activas !== 1 ? 's' : ''}</span>
                      )}
                      {deleteVerification.cotizaciones_activas > 0 && deleteVerification.reservas_activas > 0 && ' y '}
                      {deleteVerification.reservas_activas > 0 && (
                        <span>{deleteVerification.reservas_activas} reserva{deleteVerification.reservas_activas !== 1 ? 's' : ''} activa{deleteVerification.reservas_activas !== 1 ? 's' : ''}</span>
                      )}.
                      Deben cerrarse esas operaciones primero.
                    </p>
                  </div>
                </div>
              </Alert>
            )}

            {deleteVerification && deleteVerification.puede_desactivar && (
              <>
                <div className="input-group">
                  <label className="input-label">Motivo de la desactivación *</label>
                  <select
                    className="input-control"
                    value={deleteMotivo}
                    onChange={e => setDeleteMotivo(e.target.value)}
                  >
                    <option value="">Seleccioná un motivo...</option>
                    {MOTIVOS_DESACTIVACION.map(mot => (
                      <option key={mot.value} value={mot.value}>{mot.label}</option>
                    ))}
                  </select>
                </div>

                <Textarea
                  label={`Mensaje para el mayorista ${deleteMotivo === 'otro' ? '*' : '(opcional)'}`}
                  placeholder="Este mensaje se incluirá en el email de notificación..."
                  rows={3}
                  value={deleteMensaje}
                  onChange={e => setDeleteMensaje(e.target.value)}
                  maxLength={500}
                />

                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-soft)' }}>
                  Se le enviará un email al mayorista comunicando la desactivación y el motivo seleccionado.
                </p>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!historialMayorista}
        onClose={() => setHistorialMayorista(null)}
        title={`Historial — ${historialMayorista?.nombre ?? ''}`}
      >
        {historialLoading ? (
          <Spinner center />
        ) : (
          <HistorialEstadoPersonaTimeline historial={historialData} title="Línea de tiempo" />
        )}
      </Modal>

      <Modal
        isOpen={!!reactivandoMayorista}
        onClose={() => { setReactivandoMayorista(null); setFormError(''); }}
        title="Reactivar Mayorista"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setReactivandoMayorista(null); setFormError(''); }}>Cancelar</Button>
            <Button onClick={handleReactivar} isLoading={saving}>Confirmar reactivación</Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        {reactivandoMayorista && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              ¿Estás seguro que querés reactivar <strong>{reactivandoMayorista.nombre}</strong>?
              El mayorista y su usuario asociado volverán a tener acceso al sistema.
            </p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-soft)' }}>
              Sus agencias seguirán inactivas: deberán reactivarse individualmente desde el panel del mayorista.
            </p>

            {reactivandoMayorista.motivo_desactivacion && (
              <Alert variant="warning">
                <strong>Motivo de la desactivación:</strong> {MOTIVOS_DESACTIVACION.find(mot => mot.value === reactivandoMayorista.motivo_desactivacion)?.label || reactivandoMayorista.motivo_desactivacion}
                {reactivandoMayorista.motivo_desactivacion_mensaje && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>{reactivandoMayorista.motivo_desactivacion_mensaje}</p>
                )}
              </Alert>
            )}

            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-soft)' }}>
              Se le enviará un email al mayorista dándole la bienvenida de nuevo.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};
