import React, { useState, useEffect } from 'react';
import { Plus, Eye, Pencil, Trash2, AlertTriangle, FileText, CalendarCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Alert } from '../../components/ui/Alert';
import agenciaService from '../../services/agenciaService';

export const MayoristaAgencias = () => {
  const [agencias, setAgencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // --- Crear ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    nombre: '', razon_social: '', email_contacto: '', telefono: '',
    admin_nombre: '', admin_email: '', admin_password: ''
  });
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  // --- Editar ---
  const [editAgencia, setEditAgencia] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', razon_social: '', telefono: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // --- Desactivar ---
  const [deleteAgencia, setDeleteAgencia] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteVerifying, setDeleteVerifying] = useState(false);
  const [deleteVerification, setDeleteVerification] = useState(null); // { puede_desactivar, cotizaciones_activas, reservas_activas }

  // --- Error de operaciones activas ---
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
  const [blockedAgencia, setBlockedAgencia] = useState(null);
  const [blockedDetalles, setBlockedDetalles] = useState({ cotizaciones_activas: 0, reservas_activas: 0 });

  const fetchAgencias = async () => {
    setLoading(true);
    try {
      const data = await agenciaService.getAll();
      setAgencias(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgencias();
  }, []);

  // --- Handlers: Crear ---
  const handleCreate = async () => {
    setCreateError('');
    if (!createForm.nombre || !createForm.admin_email || !createForm.admin_password) {
      setCreateError('Nombre, email y contraseña del administrador son obligatorios.');
      return;
    }
    if (createForm.admin_password.trim().length < 8) {
      setCreateError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setCreateSaving(true);
    try {
      const payload = {
        nombre: createForm.nombre,
        razon_social: createForm.razon_social || createForm.nombre,
        telefono: createForm.telefono || undefined,
        email: createForm.admin_email,
        nombre_usuario: createForm.admin_nombre || createForm.admin_email?.split('@')[0],
        password: createForm.admin_password || undefined,
      };
      await agenciaService.create(payload);
      setIsCreateModalOpen(false);
      setCreateForm({ nombre: '', razon_social: '', email_contacto: '', telefono: '', admin_nombre: '', admin_email: '', admin_password: '' });
      fetchAgencias();
    } catch (err) {
      setCreateError(err.response?.data?.message || err.response?.data?.mensaje || 'Error al crear la agencia');
    } finally {
      setCreateSaving(false);
    }
  };

  // --- Handlers: Editar ---
  const handleOpenEdit = (ag) => {
    setEditAgencia(ag);
    setEditForm({ nombre: ag.nombre || '', razon_social: ag.razon_social || '', telefono: ag.telefono || '' });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEdit = async () => {
    setEditError('');
    if (!editForm.nombre) {
      setEditError('El nombre es obligatorio.');
      return;
    }
    setEditSaving(true);
    try {
      const updated = await agenciaService.update(editAgencia._id, editForm);
      setAgencias(prev => prev.map(ag =>
        ag._id === editAgencia._id ? { ...ag, ...updated.data } : ag
      ));
      setIsEditModalOpen(false);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Error al actualizar la agencia.');
    } finally {
      setEditSaving(false);
    }
  };

  // --- Handlers: Desactivar ---
  const handleOpenDelete = async (ag) => {
    setDeleteAgencia(ag);
    setDeleteVerification(null);
    setDeleteVerifying(true);
    setIsDeleteModalOpen(true);
    try {
      const verificacion = await agenciaService.verificarDesactivacion(ag._id);
      setDeleteVerification(verificacion);
    } catch {
      setDeleteVerification(null);
    } finally {
      setDeleteVerifying(false);
    }
  };

  const handleDelete = async () => {
    setDeleteSaving(true);
    try {
      await agenciaService.delete(deleteAgencia._id);
      setAgencias(prev => prev.map(ag =>
        ag._id === deleteAgencia._id ? { ...ag, activo: false } : ag
      ));
      setIsDeleteModalOpen(false);
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 400 && data?.detalles) {
        setIsDeleteModalOpen(false);
        setBlockedAgencia(deleteAgencia);
        setBlockedDetalles(data.detalles);
        setIsBlockedModalOpen(true);
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Agencias Asignadas</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={16} /> Nueva Agencia
        </Button>
      </div>

      {agencias.length === 0 ? (
        <EmptyState
          title="No hay agencias"
          description="Aún no ha registrado ninguna agencia en su panel de mayorista."
          action={<Button onClick={() => setIsCreateModalOpen(true)}>Registrar Agencia</Button>}
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>Nombre</TableCell>
                <TableCell isHeader>Razón Social</TableCell>
                <TableCell isHeader>Productos Habilitados</TableCell>
                <TableCell isHeader>Estado</TableCell>
                <TableCell isHeader>Acciones</TableCell>
              </TableRow>
            </thead>
            <tbody>
              {agencias.map(ag => (
                <TableRow key={ag._id}>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>{ag.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>{ag.usuario_id?.email ?? ag.email_contacto ?? '-'}</div>
                  </TableCell>
                  <TableCell>{ag.razon_social || '-'}</TableCell>
                  <TableCell>{ag.productos_habilitados ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={ag.activo ? 'success' : 'error'}>{ag.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <Link to={`/mayorista/agencias/${ag._id}`}>
                        <Button variant="ghost" size="sm"><Eye size={15} /> Ver</Button>
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(ag)}>
                        <Pencil size={15} /> Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() => handleOpenDelete(ag)}
                        disabled={!ag.activo}
                      >
                        <Trash2 size={15} /> Eliminar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Modal: Crear */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nueva Agencia"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} isLoading={createSaving}>Registrar Agencia</Button>
          </>
        }
      >
        {createError && <Alert variant="error">{createError}</Alert>}

        <h4 style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Datos de la Agencia</h4>
        <Input label="Nombre de Fantasía *" value={createForm.nombre} onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })} />
        <Input label="Razón Social" value={createForm.razon_social} onChange={e => setCreateForm({ ...createForm, razon_social: e.target.value })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input label="Email de Contacto" type="email" value={createForm.email_contacto} onChange={e => setCreateForm({ ...createForm, email_contacto: e.target.value })} />
          <Input label="Teléfono" value={createForm.telefono} onChange={e => setCreateForm({ ...createForm, telefono: e.target.value })} />
        </div>

        <h4 style={{ margin: '1.5rem 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Usuario Administrador</h4>
        <Input label="Nombre *" value={createForm.admin_nombre} onChange={e => setCreateForm({ ...createForm, admin_nombre: e.target.value })} />
        <Input label="Email de Login *" type="email" value={createForm.admin_email} onChange={e => setCreateForm({ ...createForm, admin_email: e.target.value })} />
        <PasswordInput label="Contraseña Inicial *" value={createForm.admin_password} onChange={e => setCreateForm({ ...createForm, admin_password: e.target.value })} />
      </Modal>

      {/* Modal: Editar */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Agencia"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} isLoading={editSaving}>Guardar Cambios</Button>
          </>
        }
      >
        {editError && <Alert variant="error">{editError}</Alert>}
        <Input
          label="Nombre *"
          value={editForm.nombre}
          onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
        />
        <Input
          label="Razón Social"
          value={editForm.razon_social}
          onChange={e => setEditForm({ ...editForm, razon_social: e.target.value })}
        />
        <Input
          label="Teléfono"
          value={editForm.telefono}
          onChange={e => setEditForm({ ...editForm, telefono: e.target.value })}
        />
      </Modal>

      {/* Modal: Confirmar desactivación */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Desactivar Agencia"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={deleteSaving || deleteVerifying}
              disabled={deleteVerifying || (deleteVerification && !deleteVerification.puede_desactivar)}
            >
              Confirmar desactivación
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            ¿Estás seguro que querés desactivar <strong>{deleteAgencia?.nombre}</strong>?
            Esta acción desactivará también el usuario asociado e impedirá que la agencia ingrese al sistema.
          </p>

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
                    La agencia tiene operaciones activas:{' '}
                    {deleteVerification.cotizaciones_activas > 0 && (
                      <span>{deleteVerification.cotizaciones_activas} cotización{deleteVerification.cotizaciones_activas !== 1 ? 'es' : ''} pendiente{deleteVerification.cotizaciones_activas !== 1 ? 's' : ''}</span>
                    )}
                    {deleteVerification.cotizaciones_activas > 0 && deleteVerification.reservas_activas > 0 && ' y '}
                    {deleteVerification.reservas_activas > 0 && (
                      <span>{deleteVerification.reservas_activas} reserva{deleteVerification.reservas_activas !== 1 ? 's' : ''} activa{deleteVerification.reservas_activas !== 1 ? 's' : ''}</span>
                    )}.
                    Cerrá estas operaciones primero.
                  </p>
                </div>
              </div>
            </Alert>
          )}

          {deleteVerification && deleteVerification.puede_desactivar && (
            <Alert variant="success">
              Sin operaciones activas. La agencia puede ser desactivada.
            </Alert>
          )}
        </div>
      </Modal>

      {/* Modal: Bloqueo por operaciones activas (error desde backend) */}
      <Modal
        isOpen={isBlockedModalOpen}
        onClose={() => setIsBlockedModalOpen(false)}
        title="No se puede desactivar esta agencia"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsBlockedModalOpen(false); navigate('/mayorista/cotizaciones'); }}
            >
              <FileText size={15} /> Ver Cotizaciones
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsBlockedModalOpen(false); navigate('/mayorista/reservas'); }}
            >
              <CalendarCheck size={15} /> Ver Reservas
            </Button>
            <Button onClick={() => setIsBlockedModalOpen(false)}>Cerrar</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '0.125rem' }} />
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              La agencia <strong>{blockedAgencia?.nombre}</strong> tiene operaciones activas que deben cerrarse primero:
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {blockedDetalles.cotizaciones_activas > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={16} style={{ color: 'var(--color-text-soft)' }} />
                  <span>Cotizaciones pendientes o aprobadas</span>
                </div>
                <Badge variant="pendiente">{blockedDetalles.cotizaciones_activas}</Badge>
              </div>
            )}
            {blockedDetalles.reservas_activas > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CalendarCheck size={16} style={{ color: 'var(--color-text-soft)' }} />
                  <span>Reservas pendientes de pago o con servicio futuro</span>
                </div>
                <Badge variant="pendiente_pago">{blockedDetalles.reservas_activas}</Badge>
              </div>
            )}
          </div>

          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-soft)', lineHeight: 1.6 }}>
            Completá estas operaciones antes de desactivar la agencia.
          </p>
        </div>
      </Modal>
    </div>
  );
};
