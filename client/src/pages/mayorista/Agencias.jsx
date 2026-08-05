import React, { useState, useEffect, useRef } from 'react';
import { Plus, Eye, Pencil, Trash2, RefreshCw, AlertTriangle, FileText, CalendarCheck, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Alert } from '../../components/ui/Alert';
import { useToast } from '../../components/ui/Toast';
import agenciaService from '../../services/agenciaService';
import { usePermiso } from '../../hooks/usePermiso';
import { formatCuit, isValidCuit } from '../../utils/cuit';
import { formatTelefono } from '../../utils/telefono';

const MOTIVOS_DESACTIVACION = [
  { value: 'incumplimiento_pago', label: 'Incumplimiento de pago' },
  { value: 'incumplimiento_terminos', label: 'Incumplimiento de términos y condiciones' },
  { value: 'inactividad', label: 'Inactividad prolongada' },
  { value: 'solicitud_agencia', label: 'Solicitud de la propia agencia' },
  { value: 'otro', label: 'Otro' },
];

export const MayoristaAgencias = () => {
  const toast = useToast();
  const puedeVerCotizaciones = usePermiso('GestionarCotizaciones');
  const puedeVerReservas = usePermiso('GestionarReservas');
  const [agencias, setAgencias] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const navigate = useNavigate();

  // --- Crear ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    nombre: '', razon_social: '', cuit: '', telefono: '', admin_email: ''
  });
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  // --- Editar ---
  const editAgenciaRef = useRef(null);
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
  const [deleteMotivo, setDeleteMotivo] = useState('');
  const [deleteMensaje, setDeleteMensaje] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // --- Error de operaciones activas ---
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
  const [blockedAgencia, setBlockedAgencia] = useState(null);
  const [blockedDetalles, setBlockedDetalles] = useState({ cotizaciones_activas: 0, reservas_activas: 0 });

  // --- Reactivar ---
  const [reactivarAgencia, setReactivarAgencia] = useState(null);
  const [isReactivarModalOpen, setIsReactivarModalOpen] = useState(false);
  const [reactivarSaving, setReactivarSaving] = useState(false);
  const [reactivarError, setReactivarError] = useState('');

  const fetchAgencias = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await agenciaService.getAll();
      setAgencias(data);
    } catch (err) {
      console.error(err);
      setFetchError(err.response?.data?.message || 'Error al cargar las agencias. Intentá de nuevo.');
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
    if (!createForm.nombre || !createForm.cuit || !createForm.admin_email) {
      setCreateError('Nombre, CUIT y email del administrador son obligatorios.');
      return;
    }
    if (!isValidCuit(createForm.cuit)) {
      setCreateError('El CUIT debe tener el formato XX-XXXXXXXX-X (11 dígitos).');
      return;
    }
    setCreateSaving(true);
    try {
      const payload = {
        nombre: createForm.nombre,
        razon_social: createForm.razon_social || createForm.nombre,
        telefono: createForm.telefono || undefined,
        cuit: createForm.cuit,
        email: createForm.admin_email,
      };
      await agenciaService.create(payload);
      setIsCreateModalOpen(false);
      setCreateForm({ nombre: '', razon_social: '', cuit: '', telefono: '', admin_email: '' });
      fetchAgencias();
      toast.success('Agencia creada. Se le envió un email de invitación para configurar su contraseña.');
    } catch (err) {
      setCreateError(err.response?.data?.message || err.response?.data?.mensaje || 'Error al crear la agencia');
    } finally {
      setCreateSaving(false);
    }
  };

  // --- Handlers: Editar ---
  const handleOpenEdit = (ag) => {
    editAgenciaRef.current = ag;
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
      const updated = await agenciaService.update(editAgenciaRef.current._id, editForm);
      setAgencias(prev => prev.map(ag =>
        ag._id === editAgenciaRef.current._id ? { ...ag, ...updated.data } : ag
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
    setDeleteMotivo('');
    setDeleteMensaje('');
    setDeleteError('');
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
    setDeleteError('');
    if (!deleteMotivo) {
      setDeleteError('Seleccioná un motivo de desactivación.');
      return;
    }
    if (deleteMotivo === 'otro' && !deleteMensaje.trim()) {
      setDeleteError('Especificá un mensaje para el motivo "Otro".');
      return;
    }
    setDeleteSaving(true);
    try {
      await agenciaService.delete(deleteAgencia._id, { motivo: deleteMotivo, mensaje: deleteMensaje.trim() });
      setAgencias(prev => prev.map(ag =>
        ag._id === deleteAgencia._id ? { ...ag, activo: false } : ag
      ));
      setIsDeleteModalOpen(false);
      toast.success('Agencia desactivada. Se le notificó el motivo por email.');
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 400 && data?.detalles) {
        setIsDeleteModalOpen(false);
        setBlockedAgencia(deleteAgencia);
        setBlockedDetalles(data.detalles);
        setIsBlockedModalOpen(true);
      } else {
        setDeleteError(data?.message || 'Error al desactivar la agencia.');
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  // --- Handlers: Reactivar ---
  const handleOpenReactivar = (ag) => {
    setReactivarAgencia(ag);
    setReactivarError('');
    setIsReactivarModalOpen(true);
  };

  const handleReactivar = async () => {
    setReactivarSaving(true);
    setReactivarError('');
    try {
      await agenciaService.reactivar(reactivarAgencia._id);
      setAgencias(prev => prev.map(ag =>
        ag._id === reactivarAgencia._id ? { ...ag, activo: true } : ag
      ));
      setIsReactivarModalOpen(false);
    } catch (err) {
      setReactivarError(err.response?.data?.message || 'Error al reactivar la agencia.');
    } finally {
      setReactivarSaving(false);
    }
  };

  const agenciasFiltradas = busqueda.trim()
    ? agencias.filter(ag =>
      ag.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      ag.razon_social?.toLowerCase().includes(busqueda.toLowerCase())
    )
    : agencias;

  if (loading) return <Spinner center size="lg" />;

  return (
    <div>
      {fetchError && <Alert variant="error" style={{ marginBottom: '1.5rem' }}>{fetchError}</Alert>}
      <div className="page-header">
        <h1 className="page-title">Agencias Asignadas</h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={16} /> Nueva Agencia
        </Button>
      </div>

      <div style={{ marginBottom: '1.5rem', maxWidth: '360px', position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)', pointerEvents: 'none' }} />
        <input
          type="text"
          aria-label="Buscar agencia"
          placeholder="Buscar por nombre o razón social..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="input-control"
          style={{ paddingLeft: '2.25rem' }}
        />
      </div>

      {agencias.length === 0 ? (
        <EmptyState
          title="No hay agencias"
          description="Aún no ha registrado ninguna agencia en su panel de mayorista."
          action={<Button onClick={() => setIsCreateModalOpen(true)}>Registrar Agencia</Button>}
        />
      ) : agenciasFiltradas.length === 0 ? (
        <EmptyState title="Sin resultados" description={`No hay agencias que coincidan con "${busqueda}".`} />
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
              {agenciasFiltradas.map(ag => (
                <TableRow key={ag._id}>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>{ag.nombre}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>{ag.usuario_id?.email ?? '-'}</span>
                      {ag.usuario_id && ag.usuario_id.activo !== true && (
                        <Badge variant="warning" style={{ fontSize: '0.65rem' }}>Sin acceso</Badge>
                      )}
                    </div>
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
                      {ag.activo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--color-error)' }}
                          onClick={() => handleOpenDelete(ag)}
                        >
                          <Trash2 size={15} /> Desactivar
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--color-success)' }}
                          onClick={() => handleOpenReactivar(ag)}
                        >
                          <RefreshCw size={15} /> Reactivar
                        </Button>
                      )}
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
        <Input label="Nombre *" value={createForm.nombre} onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })} />
        <Input label="Razón Social" value={createForm.razon_social} onChange={e => setCreateForm({ ...createForm, razon_social: e.target.value })} />
        <Input label="CUIT *" value={createForm.cuit} onChange={e => setCreateForm({ ...createForm, cuit: formatCuit(e.target.value) })} placeholder="20-12345678-9" maxLength={13} />
        <Input label="Teléfono" value={createForm.telefono} onChange={e => setCreateForm({ ...createForm, telefono: formatTelefono(e.target.value) })} placeholder="1122334455" />

        <h4 style={{ margin: '1.5rem 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Usuario Administrador</h4>
        <Input label="Email de Login *" type="email" value={createForm.admin_email} onChange={e => setCreateForm({ ...createForm, admin_email: e.target.value })} />
        <Alert variant="info">
          Se le enviará un email a esta dirección con un link para que configure su propia contraseña.
        </Alert>
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
          onChange={e => setEditForm({ ...editForm, telefono: formatTelefono(e.target.value) })}
          placeholder="1122334455"
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
            <>
              <Alert variant="success">
                Sin operaciones activas. La agencia puede ser desactivada.
              </Alert>

              <div className="input-group">
                <label className="input-label">Motivo de la desactivación *</label>
                <select
                  className="input-control"
                  value={deleteMotivo}
                  onChange={e => setDeleteMotivo(e.target.value)}
                >
                  <option value="">Seleccioná un motivo...</option>
                  {MOTIVOS_DESACTIVACION.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <Textarea
                label={`Mensaje para la agencia ${deleteMotivo === 'otro' ? '*' : '(opcional)'}`}
                placeholder="Este mensaje se incluirá en el email de notificación a la agencia..."
                rows={3}
                value={deleteMensaje}
                onChange={e => setDeleteMensaje(e.target.value)}
                maxLength={500}
              />

              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-soft)' }}>
                Se le enviará un email a la agencia comunicando la desactivación y el motivo seleccionado.
              </p>

              {deleteError && <Alert variant="error">{deleteError}</Alert>}
            </>
          )}
        </div>
      </Modal>

      {/* Modal: Confirmar reactivación */}
      <Modal
        isOpen={isReactivarModalOpen}
        onClose={() => setIsReactivarModalOpen(false)}
        title="Reactivar Agencia"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsReactivarModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleReactivar} isLoading={reactivarSaving}>Confirmar reactivación</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            ¿Estás seguro que querés reactivar <strong>{reactivarAgencia?.nombre}</strong>?
            La agencia y su usuario asociado volverán a tener acceso al sistema.
          </p>

          {reactivarAgencia?.motivo_desactivacion && (
            <Alert variant="warning">
              <strong>Motivo de la desactivación:</strong> {MOTIVOS_DESACTIVACION.find(m => m.value === reactivarAgencia.motivo_desactivacion)?.label || reactivarAgencia.motivo_desactivacion}
              {reactivarAgencia.motivo_desactivacion_mensaje && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>{reactivarAgencia.motivo_desactivacion_mensaje}</p>
              )}
            </Alert>
          )}

          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-soft)' }}>
            Se le enviará un email a la agencia dándole la bienvenida de nuevo.
          </p>

          {reactivarError && <Alert variant="error">{reactivarError}</Alert>}
        </div>
      </Modal>

      {/* Modal: Bloqueo por operaciones activas (error desde backend) */}
      <Modal
        isOpen={isBlockedModalOpen}
        onClose={() => setIsBlockedModalOpen(false)}
        title="No se puede desactivar esta agencia"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Los atajos solo aparecen si el usuario tiene acceso a esas
                secciones: si no, lo mandarían a una pantalla bloqueada. */}
            {puedeVerCotizaciones && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setIsBlockedModalOpen(false); navigate('/mayorista/cotizaciones'); }}
              >
                <FileText size={15} /> Ver Cotizaciones
              </Button>
            )}
            {puedeVerReservas && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setIsBlockedModalOpen(false); navigate('/mayorista/reservas'); }}
              >
                <CalendarCheck size={15} /> Ver Reservas
              </Button>
            )}
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
