import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Tag, Hotel, Map, Calendar as CalendarIcon, Package as PackageIcon, AlertTriangle } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { EmptyState } from '../../components/ui/EmptyState';
import { NumberStepper } from '../../components/ui/NumberStepper';
import { Alert } from '../../components/ui/Alert';
import { formatCurrency } from '../../utils/formatters';
import { applyRangePreset, daysBetween, isValidDateRange, toDateInputValue, todayDateInput } from '../../utils/dateRanges';
import productoService from '../../services/productoService';
import './productos.css';

const INITIAL_FORM = {
  nombre: '',
  descripcion: '',
  precio_base: '',
  disponibilidad_desde: '',
  disponibilidad_hasta: '',
  dias_antelacion: 1,
  // Hotel
  hotel_ciudad: '',
  hotel_direccion: '',
  hotel_estrellas: 3,
  // Actividad
  actividad_duracion: 1,
  actividad_cupo: 10,
  // Paquete
  paquete_itinerario: '',
};

const PRODUCT_DATE_PRESETS = [
  { label: '30 días', days: 30 },
  { label: '60 días', days: 60 },
  { label: '90 días', days: 90 },
  { label: '6 meses', months: 6 },
  { label: '1 año', months: 12 },
];

const getAvailabilitySummary = (form) => {
  if (!form.disponibilidad_desde || !form.disponibilidad_hasta) {
    return 'Elegí un rango de disponibilidad para publicar el producto.';
  }

  const days = daysBetween(form.disponibilidad_desde, form.disponibilidad_hasta);
  if (days === null || days < 0) return 'Rango inválido: la fecha final debe ser igual o posterior al inicio.';
  return `Disponible por ${days} día${days !== 1 ? 's' : ''}.`;
};

export const MayoristaProductos = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');

  // --- Crear ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [tipoProducto, setTipoProducto] = useState('hotel');
  const [formData, setFormData] = useState(INITIAL_FORM);

  // --- Eliminar ---
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteAgenciasCount, setDeleteAgenciasCount] = useState(0);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // --- Editar ---
  const editProductoRef = useRef(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTipo, setEditTipo] = useState('hotel');
  const [editForm, setEditForm] = useState(INITIAL_FORM);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));
  const setEdit = (key, value) => setEditForm(prev => ({ ...prev, [key]: value }));

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productoService.getAll(filtroTipo ? { tipo: filtroTipo } : {});
      setProductos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // --- Handlers: Crear ---
  const handleOpenModal = () => {
    setFormData(INITIAL_FORM);
    setTipoProducto('hotel');
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const buildPayload = (tipo, form) => {
    const payload = {
      tipo,
      nombre: form.nombre,
      descripcion: form.descripcion,
      precio_base: Number(form.precio_base),
      disponibilidad_desde: form.disponibilidad_desde,
      disponibilidad_hasta: form.disponibilidad_hasta,
    };
    if (tipo === 'hotel') {
      payload.direccion = form.hotel_direccion;
      payload.estrellas = Number(form.hotel_estrellas);
    } else if (tipo === 'actividad') {
      payload.duracion_horas = Number(form.actividad_duracion);
      payload.cupo_maximo = Number(form.actividad_cupo);
    } else if (tipo === 'paquete') {
      payload.itinerario = form.paquete_itinerario;
    }
    return payload;
  };

  const handleCreate = async () => {
    setFormError('');
    if (!formData.nombre || !formData.descripcion || !formData.precio_base) {
      setFormError('Nombre, descripción y precio son obligatorios.');
      return;
    }
    if (!formData.disponibilidad_desde || !formData.disponibilidad_hasta) {
      setFormError('Las fechas de disponibilidad son obligatorias.');
      return;
    }
    if (!isValidDateRange(formData.disponibilidad_desde, formData.disponibilidad_hasta)) {
      setFormError('La fecha de disponibilidad final debe ser igual o posterior a la inicial.');
      return;
    }
    setSaving(true);
    try {
      await productoService.create(buildPayload(tipoProducto, formData));
      setIsCreateModalOpen(false);
      fetchProductos();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Error al crear producto.');
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers: Editar ---
  const handleOpenEdit = (p) => {
    editProductoRef.current = p;
    setEditTipo(p.tipo);
    setEditForm({
      nombre: p.nombre || '',
      descripcion: p.descripcion || '',
      precio_base: p.precio_base ?? '',
      disponibilidad_desde: toDateInputValue(p.disponibilidad_desde),
      disponibilidad_hasta: toDateInputValue(p.disponibilidad_hasta),
      dias_antelacion: p.dias_antelacion ?? 1,
      hotel_ciudad: p.ciudad || '',
      hotel_direccion: p.direccion || '',
      hotel_estrellas: p.estrellas ?? 3,
      actividad_duracion: p.duracion_horas ?? 1,
      actividad_cupo: p.cupo_maximo ?? 10,
      paquete_itinerario: p.itinerario || '',
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEdit = async () => {
    setEditError('');
    if (!editForm.nombre || !editForm.descripcion || !editForm.precio_base) {
      setEditError('Nombre, descripción y precio son obligatorios.');
      return;
    }
    if (!editForm.disponibilidad_desde || !editForm.disponibilidad_hasta) {
      setEditError('Las fechas de disponibilidad son obligatorias.');
      return;
    }
    if (!isValidDateRange(editForm.disponibilidad_desde, editForm.disponibilidad_hasta)) {
      setEditError('La fecha de disponibilidad final debe ser igual o posterior a la inicial.');
      return;
    }
    setEditSaving(true);
    try {
      const result = await productoService.update(editProductoRef.current._id, buildPayload(editTipo, editForm));
      setProductos(prev => prev.map(p =>
        p._id === editProductoRef.current._id ? { ...p, ...result.data } : p
      ));
      setIsEditModalOpen(false);
    } catch (err) {
      setEditError(err.response?.data?.message || 'Error al actualizar producto.');
    } finally {
      setEditSaving(false);
    }
  };

  // --- Handlers: Eliminar ---
  const handleOpenDelete = async (p) => {
    setDeleteTarget(p);
    setDeleteAgenciasCount(0);
    setDeleteError('');
    setDeleteChecking(true);
    setIsDeleteModalOpen(true);
    try {
      const res = await productoService.checkAgencias(p._id);
      setDeleteAgenciasCount(res.agencias_count ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteChecking(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await productoService.delete(deleteTarget._id);
      setProductos(prev => prev.filter(p => p._id !== deleteTarget._id));
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Ocurrió un error al intentar eliminar el producto.';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const getIconForType = (tipo) => {
    if (tipo === 'hotel') return <Hotel />;
    if (tipo === 'actividad') return <Map />;
    if (tipo === 'paquete') return <PackageIcon />;
    return <Tag />;
  };

  const tipoLabel = { hotel: 'Hotel', actividad: 'Actividad', paquete: 'Paquete' };

  const applyProductPreset = (preset, mode = 'create') => {
    const currentForm = mode === 'edit' ? editForm : formData;
    const update = mode === 'edit' ? setEditForm : setFormData;
    const range = applyRangePreset({
      startInput: currentForm.disponibilidad_desde,
      days: preset.days,
      months: preset.months,
      fallbackStart: todayDateInput(),
    });

    update(prev => ({
      ...prev,
      disponibilidad_desde: range.start,
      disponibilidad_hasta: range.end,
    }));
  };

  const renderAvailabilityFields = (form, onSet, mode = 'create') => {
    const invalidRange =
      form.disponibilidad_desde &&
      form.disponibilidad_hasta &&
      !isValidDateRange(form.disponibilidad_desde, form.disponibilidad_hasta);

    return (
      <div className={`availability-box ${invalidRange ? 'availability-box-error' : ''}`}>
        <div className="availability-header">
          <div>
            <h4>Disponibilidad</h4>
            <p>{getAvailabilitySummary(form)}</p>
          </div>
          <CalendarIcon size={18} />
        </div>
        <div className="availability-grid">
          <Input
            label="Disponible desde *"
            type="date"
            value={form.disponibilidad_desde}
            onChange={e => onSet('disponibilidad_desde', e.target.value)}
          />
          <Input
            label="Disponible hasta *"
            type="date"
            min={form.disponibilidad_desde || undefined}
            value={form.disponibilidad_hasta}
            onChange={e => onSet('disponibilidad_hasta', e.target.value)}
          />
        </div>
        <div className="availability-presets">
          {PRODUCT_DATE_PRESETS.map(preset => (
            <button key={preset.label} type="button" onClick={() => applyProductPreset(preset, mode)}>
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (loading && productos.length === 0) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Catálogo de Productos</h1>
        <Button onClick={handleOpenModal}>
          <Plus size={16} /> Crear Producto
        </Button>
      </div>

      <div style={{ marginBottom: '2rem', maxWidth: '300px' }}>
        <Select
          value={filtroTipo}
          placeholder={false}
          onChange={e => setFiltroTipo(e.target.value)}
          options={[
            { label: 'Todos los tipos', value: '' },
            { label: 'Hotel', value: 'hotel' },
            { label: 'Actividad', value: 'actividad' },
            { label: 'Paquete', value: 'paquete' }
          ]}
        />
      </div>

      {productos.length === 0 ? (
        <EmptyState title="No se encontraron productos" description="Ajuste sus filtros o cree un nuevo producto." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {productos.map(p => (
            <Card key={p._id}>
              <CardBody style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-bg)', borderRadius: '12px', color: 'var(--color-primary)' }}>
                    {getIconForType(p.tipo)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(p)}>
                      <Pencil size={14} /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDelete(p)}
                      style={{ color: 'var(--color-error, #DC2626)' }}
                    >
                      <Trash2 size={14} />
                    </Button>
                    <Badge variant={p.activo ? 'success' : 'error'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                </div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{p.nombre}</h3>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '1.5rem', flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.descripcion}
                </p>
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Precio Base</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text)' }}>{formatCurrency(p.precio_base)}</div>
                  </div>
                  <Badge variant="info" style={{ textTransform: 'capitalize' }}>{p.tipo}</Badge>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Crear */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Crear Nuevo Producto"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} isLoading={saving}>Guardar Producto</Button>
          </>
        }
      >
        {formError && <Alert variant="error">{formError}</Alert>}
        <Select
          label="Tipo de Producto *"
          value={tipoProducto}
          onChange={e => setTipoProducto(e.target.value)}
          options={[
            { label: 'Hotel', value: 'hotel' },
            { label: 'Actividad', value: 'actividad' },
            { label: 'Paquete', value: 'paquete' }
          ]}
        />
        <Input label="Nombre *" value={formData.nombre} onChange={e => set('nombre', e.target.value)} />
        <Textarea label="Descripción *" rows={3} value={formData.descripcion} onChange={e => set('descripcion', e.target.value)} />
        <Input label="Precio Base (USD) *" type="number" min="0" value={formData.precio_base} onChange={e => set('precio_base', e.target.value)} />
        {renderAvailabilityFields(formData, set, 'create')}
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>Detalles Específicos</h4>
          {tipoProducto === 'hotel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input label="Ciudad" value={formData.hotel_ciudad} onChange={e => set('hotel_ciudad', e.target.value)} />
                <Input label="Dirección *" value={formData.hotel_direccion} onChange={e => set('hotel_direccion', e.target.value)} />
              </div>
              <NumberStepper label="Estrellas *" value={formData.hotel_estrellas} min={1} max={5} onChange={v => set('hotel_estrellas', v)} />
            </div>
          )}
          {tipoProducto === 'actividad' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <NumberStepper label="Duración (horas) *" value={formData.actividad_duracion} min={1} max={72} onChange={v => set('actividad_duracion', v)} />
              <NumberStepper label="Cupo máximo *" value={formData.actividad_cupo} min={1} max={500} onChange={v => set('actividad_cupo', v)} />
            </div>
          )}
          {tipoProducto === 'paquete' && (
            <Textarea label="Itinerario *" rows={4} value={formData.paquete_itinerario} onChange={e => set('paquete_itinerario', e.target.value)} placeholder="Ej: Día 1: Llegada a Bariloche. Día 2: Circuito Chico..." />
          )}
        </div>
      </Modal>

      {/* Modal: Eliminar */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setDeleteTarget(null); setDeleteError(''); }}
        title="Eliminar Producto"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsDeleteModalOpen(false); setDeleteTarget(null); setDeleteError(''); }}>
              Cancelar
            </Button>
            {!deleteError && (
              <Button
                onClick={handleDelete}
                isLoading={deleting}
                disabled={deleteChecking}
                style={{ backgroundColor: 'var(--color-error, #DC2626)', borderColor: 'var(--color-error, #DC2626)' }}
              >
                Eliminar de todos modos
              </Button>
            )}
          </>
        }
      >
        {deleteChecking ? (
          <Spinner center />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {deleteError ? (
              <Alert variant="error">{deleteError}</Alert>
            ) : (
              <>
                {deleteAgenciasCount > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    padding: '1rem',
                    backgroundColor: 'var(--color-warning-soft)',
                    border: '1px solid var(--color-warning)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-warning)',
                  }}>
                    <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                    <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text)' }}>
                      <strong>¡Atención!</strong> Este producto está vinculado a{' '}
                      <strong>{deleteAgenciasCount} agencia{deleteAgenciasCount !== 1 ? 's' : ''}</strong>.
                      Al eliminarlo, dejará de estar disponible para {deleteAgenciasCount !== 1 ? 'ellas' : 'ella'}.
                    </p>
                  </div>
                )}
                <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.9375rem' }}>
                  ¿Estás seguro de que deseas eliminar{' '}
                  <strong style={{ color: 'var(--color-text)' }}>{deleteTarget?.nombre}</strong>?
                  Esta acción lo marcará como inactivo.
                </p>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Editar */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Producto"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} isLoading={editSaving}>Guardar Cambios</Button>
          </>
        }
      >
        {editError && <Alert variant="error">{editError}</Alert>}

        <div style={{ marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginRight: '0.5rem' }}>Tipo:</span>
          <Badge variant="info" style={{ textTransform: 'capitalize' }}>{tipoLabel[editTipo] ?? editTipo}</Badge>
        </div>

        <Input label="Nombre *" value={editForm.nombre} onChange={e => setEdit('nombre', e.target.value)} />
        <Textarea label="Descripción *" rows={3} value={editForm.descripcion} onChange={e => setEdit('descripcion', e.target.value)} />

        <Input label="Precio Base (USD) *" type="number" min="0" value={editForm.precio_base} onChange={e => setEdit('precio_base', e.target.value)} />
        <Alert variant="info" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Las cotizaciones ya realizadas no se verán afectadas por este cambio.
        </Alert>

        {renderAvailabilityFields(editForm, setEdit, 'edit')}

        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
          <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>Detalles Específicos</h4>
          {editTipo === 'hotel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input label="Ciudad" value={editForm.hotel_ciudad} onChange={e => setEdit('hotel_ciudad', e.target.value)} />
                <Input label="Dirección *" value={editForm.hotel_direccion} onChange={e => setEdit('hotel_direccion', e.target.value)} />
              </div>
              <NumberStepper label="Estrellas *" value={editForm.hotel_estrellas} min={1} max={5} onChange={v => setEdit('hotel_estrellas', v)} />
            </div>
          )}
          {editTipo === 'actividad' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <NumberStepper label="Duración (horas) *" value={editForm.actividad_duracion} min={1} max={72} onChange={v => setEdit('actividad_duracion', v)} />
              <NumberStepper label="Cupo máximo *" value={editForm.actividad_cupo} min={1} max={500} onChange={v => setEdit('actividad_cupo', v)} />
            </div>
          )}
          {editTipo === 'paquete' && (
            <Textarea label="Itinerario *" rows={4} value={editForm.paquete_itinerario} onChange={e => setEdit('paquete_itinerario', e.target.value)} placeholder="Ej: Día 1: Llegada a Bariloche. Día 2: Circuito Chico..." />
          )}
        </div>
      </Modal>
    </div>
  );
};
