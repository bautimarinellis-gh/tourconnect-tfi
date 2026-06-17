import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, KeyRound, Search } from 'lucide-react';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { useToast } from '../../components/ui/Toast';
import mayoristaService from '../../services/mayoristaService';

const SUBSCRIPTION_PLANS = [
  { value: 'Starter', label: 'Starter', description: 'Hasta 20 agencias' },
  { value: 'Professional', label: 'Professional', description: '21 a 100 agencias' },
  { value: 'Enterprise', label: 'Enterprise', description: 'Más de 100 agencias' },
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
  const [editFormData, setEditFormData] = useState({ nombre: '', razon_social: '', telefono: '', cuit: '', plan_suscripcion: 'Starter', activo: true });
  const [deletingMayorista, setDeletingMayorista] = useState(null);
  const [activarUsuarioMayorista, setActivarUsuarioMayorista] = useState(null);
  const [activarPassword, setActivarPassword] = useState('');
  const [formData, setFormData] = useState({
    nombre: '', razon_social: '', cuit: '', plan_suscripcion: 'Starter', email_contacto: '', telefono: '', admin_nombre: '', admin_email: '', admin_password: ''
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
    if (!formData.nombre || !formData.cuit || !formData.admin_email || !formData.admin_password) {
      showFormError('Nombre, CUIT, email y contraseña del administrador son obligatorios.');
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
        password: formData.admin_password || undefined,
      };
      await mayoristaService.create(payload);
      setIsModalOpen(false);
      setFormData({ nombre: '', razon_social: '', cuit: '', plan_suscripcion: 'Starter', email_contacto: '', telefono: '', admin_nombre: '', admin_email: '', admin_password: '' });
      fetchMayoristas();
      toast.success('Mayorista creado exitosamente.');
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
      activo: m.activo !== false,
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
    setSaving(true);
    try {
      await mayoristaService.update(editingMayorista._id, {
        nombre: editFormData.nombre,
        razon_social: editFormData.razon_social?.trim() || editFormData.nombre,
        telefono: editFormData.telefono || null,
        cuit: editFormData.cuit,
        plan_suscripcion: editFormData.plan_suscripcion,
        activo: Boolean(editFormData.activo),
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
    setSaving(true);
    try {
      await mayoristaService.delete(deletingMayorista._id);
      setDeletingMayorista(null);
      fetchMayoristas();
      toast.success('Mayorista desactivado.');
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
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.875rem', color: 'var(--color-text)', fontFamily: 'var(--font-family)' }}
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
                  <TableCell isHeader>Agencias / Reservas</TableCell>
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
                        <div style={{ fontWeight: 500 }}>{m.kpis?.agencias_activas ?? 0} agencias</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
                          {m.kpis?.reservas_totales ?? 0} reservas
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.activo ? 'success' : 'error'}>{m.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(m)} title="Editar"><Edit2 size={16} /></Button>
                        {sinAcceso && m.usuario_id && (
                          <Button variant="ghost" size="sm" onClick={() => { setActivarUsuarioMayorista(m); setActivarPassword(''); setFormError(''); }} title="Configurar contraseña"><KeyRound size={16} /></Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-danger" onClick={() => handleDelete(m)} title="Desactivar"><Trash2 size={16} /></Button>
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
        <Input label="Nombre de Fantasía *" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
        <Input label="Razón Social" value={formData.razon_social} onChange={e => setFormData({...formData, razon_social: e.target.value})} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input label="CUIT *" value={formData.cuit} onChange={e => setFormData({ ...formData, cuit: e.target.value })} />
          <SubscriptionPlanSelect label="Plan de suscripción" value={formData.plan_suscripcion} onChange={e => setFormData({ ...formData, plan_suscripcion: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input label="Email de Contacto" type="email" value={formData.email_contacto} onChange={e => setFormData({...formData, email_contacto: e.target.value})} />
          <Input label="Teléfono" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
        </div>

        <h4 style={{ margin: '1.5rem 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Usuario Administrador</h4>
        <Input label="Nombre del Administrador *" value={formData.admin_nombre} onChange={e => setFormData({...formData, admin_nombre: e.target.value})} />
        <Input label="Email del Administrador (Login) *" type="email" value={formData.admin_email} onChange={e => setFormData({...formData, admin_email: e.target.value})} />
        <PasswordInput label="Contraseña Provisoria *" value={formData.admin_password} onChange={e => setFormData({...formData, admin_password: e.target.value})} />
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
          <Input label="Nombre de Fantasía *" value={editFormData.nombre} onChange={e => setEditFormData({...editFormData, nombre: e.target.value})} />
          <Input label="Razón Social" value={editFormData.razon_social} onChange={e => setEditFormData({...editFormData, razon_social: e.target.value})} />
          <Input label="CUIT *" value={editFormData.cuit} onChange={e => setEditFormData({...editFormData, cuit: e.target.value})} />
          <SubscriptionPlanSelect label="Plan de suscripción" value={editFormData.plan_suscripcion} onChange={e => setEditFormData({...editFormData, plan_suscripcion: e.target.value })} />
          <Input label="Teléfono" value={editFormData.telefono} onChange={e => setEditFormData({...editFormData, telefono: e.target.value})} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              id="edit-activo"
              checked={editFormData.activo}
              onChange={e => setEditFormData({...editFormData, activo: e.target.checked})}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <label htmlFor="edit-activo" style={{ cursor: 'pointer', fontWeight: 500 }}>Mayorista activo</label>
          </div>
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
            <Button variant="danger" onClick={confirmDelete} isLoading={saving}>Desactivar</Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        {deletingMayorista && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0 }}>
              ¿Estás seguro de que deseas desactivar <strong>{deletingMayorista.nombre}</strong>?
            </p>
            <Alert variant="warning">
              Se desactivarán también todas sus agencias ({deletingMayorista.kpis?.agencias_activas ?? 0} activas) y el usuario administrador asociado.
            </Alert>
          </div>
        )}
      </Modal>
    </div>
  );
};
