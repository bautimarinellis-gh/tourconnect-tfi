import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Hotel, Map, Package as PackageIcon, ShoppingCart, Calendar } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import productoService from '../../services/productoService';
import cotizacionService from '../../services/cotizacionService';
import { useToast } from '../../components/ui/Toast';

export const AgenciaCatalogo = () => {
  const toast = useToast();
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha_inicio: '',
    fecha_fin: '',
    cantidad_pasajeros: 1,
    notas: ''
  });

  const fetchCatalogo = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productoService.getCatalogo(filtroTipo ? { tipo: filtroTipo } : {});
      setProductos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo]);

  useEffect(() => {
    fetchCatalogo();
  }, [fetchCatalogo]);

  const handleCotizar = async () => {
    if (!formData.fecha_inicio || !formData.fecha_fin || formData.cantidad_pasajeros < 1) {
      toast.error('Debe completar las fechas y la cantidad de pasajeros.');
      return;
    }
    if (new Date(formData.fecha_inicio) > new Date(formData.fecha_fin)) {
      toast.error('La fecha de inicio debe ser anterior a la fecha de fin.');
      return;
    }
    setActionLoading(true);
    try {
      await cotizacionService.create({
        producto_id:  selectedProduct._id,
        fecha_inicio: formData.fecha_inicio,
        fecha_fin:    formData.fecha_fin,
        pasajeros:    formData.cantidad_pasajeros,
        notas:        formData.notas,
      });
      toast.success('Cotización generada exitosamente. El mayorista la revisará pronto.');
      setIsModalOpen(false);
      setFormData({ fecha_inicio: '', fecha_fin: '', cantidad_pasajeros: 1, notas: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.mensaje || 'Error al generar la cotización.');
    } finally {
      setActionLoading(false);
    }
  };

  const openQuoteModal = (producto) => {
    setSelectedProduct(producto);
    setFormData({ fecha_inicio: '', fecha_fin: '', cantidad_pasajeros: 1, notas: '' });
    setIsModalOpen(true);
  };

  const getIconForType = (tipo) => {
    if (tipo === 'hotel') return <Hotel />;
    if (tipo === 'actividad') return <Map />;
    if (tipo === 'paquete') return <PackageIcon />;
    return <Tag />;
  };

  // Convierte un Date/string ISO a "YYYY-MM-DD" para min/max de <input type="date">
  const toDateInputValue = (val) => {
    if (!val) return '';
    return String(val).split('T')[0];
  };

  if (loading && productos.length === 0) return <Spinner center size="lg" />;

  const cantidadNoches =
    formData.fecha_inicio && formData.fecha_fin
      ? Math.round(
          (new Date(formData.fecha_fin) - new Date(formData.fecha_inicio)) / 86400000
        )
      : 0;

  const precioFinalEstimado =
    selectedProduct && cantidadNoches > 0
      ? selectedProduct.precio_final * cantidadNoches * formData.cantidad_pasajeros
      : 0;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Catálogo de Experiencias</h1>
      </div>

      <div style={{ marginBottom: '2rem', maxWidth: '300px' }}>
        <Select
          value={filtroTipo}
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
        <EmptyState title="Catálogo vacío" description="Su mayorista aún no ha habilitado productos para su agencia." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
          {productos.map(p => (
            <Card key={p._id} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: 'none', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ height: '160px', backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                <img
                  src={`https://images.unsplash.com/photo-${p.tipo === 'hotel' ? '1566073771506-d2df80738e4a' : p.tipo === 'actividad' ? '1520625340621-c4fc7ae046f1' : '1436491865332-7a61a109cc05'}?q=80&w=800&auto=format&fit=crop`}
                  alt={p.nombre}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <CardBody style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <Badge variant="info" style={{ textTransform: 'capitalize' }}>{p.tipo}</Badge>
                  <div style={{ color: 'var(--color-primary)' }}>{getIconForType(p.tipo)}</div>
                </div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{p.nombre}</h3>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.75rem', flexGrow: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.descripcion}
                </p>
                {/* Disponibilidad */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-soft)', marginBottom: '1rem' }}>
                  <Calendar size={12} />
                  <span>Disponible: {formatDate(p.disponibilidad_desde)} — {formatDate(p.disponibilidad_hasta)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>Precio Final p/ pax</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>{formatCurrency(p.precio_final)}</div>
                  </div>
                  <Button onClick={() => openQuoteModal(p)}>
                    <ShoppingCart size={16} /> Cotizar
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Cotización */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Cotización"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCotizar} isLoading={actionLoading}>Confirmar Cotización</Button>
          </>
        }
      >
        {selectedProduct && (
          <>
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>{selectedProduct.nombre}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Precio Unitario:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedProduct.precio_final)}</span>
              </div>
            </div>

            <Alert variant="info" style={{ marginBottom: '1rem' }}>
              Disponible del <strong>{formatDate(selectedProduct.disponibilidad_desde)}</strong> al <strong>{formatDate(selectedProduct.disponibilidad_hasta)}</strong>.
            </Alert>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Input
            type="date"
            label="Fecha Inicio *"
            min={toDateInputValue(selectedProduct?.disponibilidad_desde)}
            max={toDateInputValue(selectedProduct?.disponibilidad_hasta)}
            value={formData.fecha_inicio}
            onChange={e => setFormData({ ...formData, fecha_inicio: e.target.value })}
          />
          <Input
            type="date"
            label="Fecha Fin *"
            min={toDateInputValue(selectedProduct?.disponibilidad_desde)}
            max={toDateInputValue(selectedProduct?.disponibilidad_hasta)}
            value={formData.fecha_fin}
            onChange={e => setFormData({ ...formData, fecha_fin: e.target.value })}
          />
        </div>
        <Input
          type="number"
          min="1"
          label="Cantidad de Pasajeros *"
          value={formData.cantidad_pasajeros}
          onChange={e => setFormData({ ...formData, cantidad_pasajeros: Number(e.target.value) })}
        />
        <Textarea
          label="Notas adicionales"
          rows={2}
          value={formData.notas}
          onChange={e => setFormData({ ...formData, notas: e.target.value })}
          placeholder="Ej: Dos adultos y un niño..."
        />

        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Total Estimado:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {formatCurrency(precioFinalEstimado)}
            </span>
          </div>
          {cantidadNoches > 0 && (
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-soft)', textAlign: 'right' }}>
              {formatCurrency(selectedProduct?.precio_final)} × {cantidadNoches} noche{cantidadNoches !== 1 ? 's' : ''} × {formData.cantidad_pasajeros} pax
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
};
