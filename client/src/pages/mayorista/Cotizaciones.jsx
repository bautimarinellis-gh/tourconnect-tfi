import React, { useState, useEffect } from 'react';
import { Check, X, Eye } from 'lucide-react';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, formatDate, formatEstadoCotizacion } from '../../utils/formatters';
import cotizacionService from '../../services/cotizacionService';

export const MayoristaCotizaciones = () => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  
  // Modal: Rechazar
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Modal: Detalle
  const [detailCotizacion, setDetailCotizacion] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Modal: Éxito al confirmar
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchCotizaciones = async () => {
    setLoading(true);
    try {
      const data = await cotizacionService.getAll(filtroEstado ? { estado: filtroEstado } : {});
      setCotizaciones(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCotizaciones();
  }, [filtroEstado]);

  const handleAction = async (id, status, reason = '') => {
    if (status === 'rechazada' && !reason) {
      setRejectError('El motivo de rechazo es obligatorio.');
      return;
    }
    setActionLoading(true);
    setRejectError('');
    try {
      await cotizacionService.updateStatus(id, status, reason);
      setIsRejectModalOpen(false);
      setRejectReason('');
      fetchCotizaciones();
      if (status === 'aprobada') {
        setSuccessMessage('La cotización fue aprobada exitosamente. La agencia podrá generar la reserva.');
        setIsSuccessModalOpen(true);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Ocurrió un error al actualizar la cotización.';
      setRejectError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && cotizaciones.length === 0) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Administrar Cotizaciones</h1>
      </div>

      <div style={{ marginBottom: '2rem', maxWidth: '300px' }}>
        <Select 
          value={filtroEstado} 
          onChange={e => setFiltroEstado(e.target.value)}
          options={[
            { label: 'Todos los estados', value: '' },
            { label: 'Pendiente', value: 'pendiente' },
            { label: 'Aprobada', value: 'aprobada' },
            { label: 'Rechazada', value: 'rechazada' },
            { label: 'Cancelada por agencia', value: 'cancelada' },
            { label: 'Vencida', value: 'vencida' },
            { label: 'Reserva Generada', value: 'reserva_generada' },
          ]}
        />
      </div>

      {cotizaciones.length === 0 ? (
        <EmptyState title="No hay cotizaciones" description="No se encontraron cotizaciones con los filtros actuales." />
      ) : (
        <Card>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>ID / Fecha</TableCell>
                <TableCell isHeader>Agencia</TableCell>
                <TableCell isHeader>Producto</TableCell>
                <TableCell isHeader>Pasajeros</TableCell>
                <TableCell isHeader>Total</TableCell>
                <TableCell isHeader>Estado</TableCell>
                <TableCell isHeader>Acciones</TableCell>
              </TableRow>
            </thead>
            <tbody>
              {cotizaciones.map(c => (
                <TableRow key={c._id}>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>#{c._id.slice(-6).toUpperCase()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
                      {formatDate(c.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>{c.agencia_id?.nombre || c.agencia_id?.username || 'N/A'}</TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>{c.producto_id?.nombre || 'Producto'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', textTransform: 'capitalize' }}>
                      {c.producto_id?.tipo && `${c.producto_id.tipo} · `}{formatDate(c.fecha_inicio)} - {formatDate(c.fecha_fin)}
                    </div>
                  </TableCell>
                  <TableCell>{c.pasajeros}</TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{formatCurrency(c.precio_total)}</TableCell>
                  <TableCell>
                    {c.estado === 'cancelada' ? (
                      <Badge variant="cancelada">Cancelada por agencia</Badge>
                    ) : (
                      <Badge variant={c.estado}>{formatEstadoCotizacion(c.estado)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.estado === 'pendiente' ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button size="sm" variant="success" onClick={() => handleAction(c._id, 'aprobada')} isLoading={actionLoading} style={{ backgroundColor: 'var(--color-success)', color: 'white' }}>
                          <Check size={16} />
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => { setSelectedCotizacion(c); setIsRejectModalOpen(true); }}>
                          <X size={16} />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { setDetailCotizacion(c); setIsDetailModalOpen(true); }}>
                        <Eye size={16} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Modal: Rechazar */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => { setIsRejectModalOpen(false); setRejectReason(''); setRejectError(''); }}
        title="Rechazar Cotización"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsRejectModalOpen(false); setRejectReason(''); setRejectError(''); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleAction(selectedCotizacion._id, 'rechazada', rejectReason)}
              isLoading={actionLoading}
              style={{ backgroundColor: 'var(--color-error, #DC2626)', borderColor: 'var(--color-error, #DC2626)' }}
            >
              Rechazar
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rejectError && <Alert variant="error">{rejectError}</Alert>}
          <p style={{ margin: 0, color: 'var(--color-text-soft)' }}>
            Indicá el motivo por el cual rechazás esta cotización. El motivo es obligatorio.
          </p>
          <Input
            label="Motivo de rechazo *"
            value={rejectReason}
            onChange={e => { setRejectReason(e.target.value); setRejectError(''); }}
            placeholder="Ej: Sin disponibilidad en las fechas solicitadas..."
          />
        </div>
      </Modal>

      {/* Modal: Detalle de cotización */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => { setIsDetailModalOpen(false); setDetailCotizacion(null); }}
        title="Detalle de Cotización"
        footer={
          <Button variant="ghost" onClick={() => { setIsDetailModalOpen(false); setDetailCotizacion(null); }}>
            Cerrar
          </Button>
        }
      >
        {detailCotizacion && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9375rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>ID</span>
              <span style={{ fontWeight: 500 }}>#{detailCotizacion._id.slice(-6).toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>Agencia</span>
              <span>{detailCotizacion.agencia_id?.nombre || detailCotizacion.agencia_id?.username || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>Producto</span>
              <span>{detailCotizacion.producto_id?.nombre || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>Fechas</span>
              <span>{formatDate(detailCotizacion.fecha_inicio)} — {formatDate(detailCotizacion.fecha_fin)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>Pasajeros</span>
              <span>{detailCotizacion.pasajeros}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>Total</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(detailCotizacion.precio_total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-soft)' }}>Estado</span>
              <Badge variant={detailCotizacion.estado}>{formatEstadoCotizacion(detailCotizacion.estado)}</Badge>
            </div>
            {detailCotizacion.motivo_rechazo && (
              <div style={{ marginTop: '0.25rem' }}>
                <Alert variant="error">
                  <strong>Motivo de rechazo:</strong> {detailCotizacion.motivo_rechazo}
                </Alert>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Éxito al confirmar */}
      <Modal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title="Cotización Aprobada"
        footer={
          <Button onClick={() => setIsSuccessModalOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <Alert variant="success">{successMessage}</Alert>
      </Modal>
    </div>
  );
};
