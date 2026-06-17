import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Hotel, Map, Package as PackageIcon, ShoppingCart, Calendar, Minus, Plus, Search } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { addDays, applyRangePreset, daysBetween, isValidDateRange, toDateInputValue } from '../../utils/dateRanges';
import productoService from '../../services/productoService';
import cotizacionService from '../../services/cotizacionService';
import { useToast } from '../../components/ui/Toast';
import './catalogo.css';

const QUOTE_DURATION_PRESETS = [
  { label: '1 día', days: 1 },
  { label: '3 días', days: 3 },
  { label: '7 días', days: 7 },
  { label: '14 días', days: 14 },
];

export const AgenciaCatalogo = () => {
  const toast = useToast();
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [formData, setFormData] = useState({
    fecha_inicio: '',
    fecha_fin: '',
    cantidad_pasajeros: 1,
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
    if (!isValidDateRange(formData.fecha_inicio, formData.fecha_fin, { allowSameDay: false })) {
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
      });
      toast.success('Cotización generada exitosamente. El mayorista la revisará pronto.');
      setFormData({ fecha_inicio: '', fecha_fin: '', cantidad_pasajeros: 1 });
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.mensaje || 'Error al generar la cotización.');
    } finally {
      setActionLoading(false);
    }
  };

  const productosFiltrados = busqueda.trim()
    ? productos.filter(p => p.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
    : productos;

  const selectProduct = (producto) => {
    setSelectedProduct(producto);
    setFormData({ fecha_inicio: '', fecha_fin: '', cantidad_pasajeros: 1 });
  };

  const getIconForType = (tipo) => {
    if (tipo === 'hotel') return <Hotel />;
    if (tipo === 'actividad') return <Map />;
    if (tipo === 'paquete') return <PackageIcon />;
    return <Tag />;
  };

  if (loading && productos.length === 0) return <Spinner center size="lg" />;

  const minDisponible = toDateInputValue(selectedProduct?.disponibilidad_desde);
  const maxDisponible = toDateInputValue(selectedProduct?.disponibilidad_hasta);
  const cantidadNoches =
    formData.fecha_inicio && formData.fecha_fin
      ? daysBetween(formData.fecha_inicio, formData.fecha_fin)
      : 0;

  const precioFinalEstimado =
    selectedProduct && cantidadNoches > 0
      ? selectedProduct.precio_final * cantidadNoches * formData.cantidad_pasajeros
      : 0;

  const canApplyDurationPreset = (days) => {
    if (!selectedProduct || !maxDisponible) return false;
    const start = formData.fecha_inicio || minDisponible;
    const end = addDays(start, days);
    return Boolean(start && end && end <= maxDisponible);
  };

  const applyDurationPreset = (days) => {
    if (!selectedProduct || !canApplyDurationPreset(days)) return;
    const range = applyRangePreset({
      startInput: formData.fecha_inicio,
      days,
      fallbackStart: minDisponible,
      maxEnd: maxDisponible,
    });
    setFormData(prev => ({
      ...prev,
      fecha_inicio: range.start,
      fecha_fin: range.end,
    }));
  };

  return (
    <div className="catalog-page">
      <div className="page-header">
        <div>
          <p className="page-kicker">Experiencias disponibles</p>
          <h1 className="page-title">Catálogo</h1>
        </div>
      </div>

      <div className="toolbar-row catalog-toolbar">
        <Select
          className="catalog-filter"
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
        <div className="catalog-shell">
          <Card className="catalog-list-card">
            <div className="catalog-search-row">
              <span className="catalog-search-icon"><Search size={16} /></span>
              <input
                type="text"
                placeholder="Buscar experiencia..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="catalog-search-input"
              />
            </div>
            <div className="catalog-list">
              {productosFiltrados.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>
                  No hay productos que coincidan con "{busqueda}".
                </div>
              ) : null}
              {productosFiltrados.map(p => {
                const active = selectedProduct?._id === p._id;
                return (
                  <button
                    key={p._id}
                    type="button"
                    className={`catalog-item ${active ? 'active' : ''}`}
                    onClick={() => selectProduct(p)}
                  >
                    <span className="catalog-item-thumb">{getIconForType(p.tipo)}</span>
                    <span className="catalog-item-main">
                      <span className="catalog-item-title">{p.nombre}</span>
                      <span className="catalog-item-meta">
                        <Badge variant="info" style={{ textTransform: 'capitalize' }}>{p.tipo}</Badge>
                        <span><Calendar size={12} /> {formatDate(p.disponibilidad_desde)}</span>
                      </span>
                    </span>
                    <span className="catalog-item-price">{formatCurrency(p.precio_final)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="quote-panel">
            <CardBody>
              <div className="quote-panel-header">
                <div>
                  <p className="page-kicker">Cotización</p>
                  <h2>{selectedProduct?.nombre || 'Seleccioná un producto'}</h2>
                </div>
                {selectedProduct && <span className="metric-icon">{getIconForType(selectedProduct.tipo)}</span>}
              </div>

              {selectedProduct ? (
                <>
                  <p className="quote-description">{selectedProduct.descripcion}</p>
                  <div className="quote-info-row">
                    <span>Precio por pasajero</span>
                    <strong>{formatCurrency(selectedProduct.precio_final)}</strong>
                  </div>
                  <Alert variant="info">
                    Disponible del <strong>{formatDate(selectedProduct.disponibilidad_desde)}</strong> al <strong>{formatDate(selectedProduct.disponibilidad_hasta)}</strong>.
                  </Alert>
                  <div className="quote-form-grid">
                    <Input
                      type="date"
                      label="Inicio"
                      min={minDisponible}
                      max={maxDisponible}
                      value={formData.fecha_inicio}
                      onChange={e => setFormData({ ...formData, fecha_inicio: e.target.value })}
                    />
                    <Input
                      type="date"
                      label="Fin"
                      min={formData.fecha_inicio || minDisponible}
                      max={maxDisponible}
                      value={formData.fecha_fin}
                      onChange={e => setFormData({ ...formData, fecha_fin: e.target.value })}
                    />
                  </div>
                  <div className="quote-duration-presets" aria-label="Duración de la cotización">
                    {QUOTE_DURATION_PRESETS.map(preset => {
                      const disabled = !canApplyDurationPreset(preset.days);
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          disabled={disabled}
                          onClick={() => applyDurationPreset(preset.days)}
                          title={disabled ? 'Fuera de la disponibilidad del producto' : preset.label}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="quote-stepper-row">
                    <span>Pasajeros</span>
                    <div className="quote-stepper">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cantidad_pasajeros: Math.max(1, formData.cantidad_pasajeros - 1) })}
                      >
                        <Minus size={14} />
                      </button>
                      <strong>{formData.cantidad_pasajeros}</strong>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, cantidad_pasajeros: formData.cantidad_pasajeros + 1 })}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="quote-total-row">
                    <span>Total estimado</span>
                    <strong>{formatCurrency(precioFinalEstimado)}</strong>
                  </div>
                  {cantidadNoches > 0 && (
                    <p className="quote-breakdown">
                      {formatCurrency(selectedProduct?.precio_final)} x {cantidadNoches} noche{cantidadNoches !== 1 ? 's' : ''} x {formData.cantidad_pasajeros} pax
                    </p>
                  )}
                  <Button className="w-full" size="lg" onClick={handleCotizar} isLoading={actionLoading}>
                    <ShoppingCart size={16} /> Confirmar cotización
                  </Button>
                </>
              ) : (
                <div className="quote-empty">
                  <ShoppingCart size={22} />
                  <p>Elegí una experiencia de la lista para ver fechas, pasajeros y total estimado.</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

    </div>
  );
};
