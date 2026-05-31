import React, { useState, useEffect } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Alert } from '../../components/ui/Alert';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { formatCurrency, formatDate, formatEstadoCotizacion } from '../../utils/formatters';
import cotizacionService from '../../services/cotizacionService';
import reservaService from '../../services/reservaService';
import { useNavigate } from 'react-router-dom';

export const AgenciaCotizaciones = () => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const navigate = useNavigate();

  // Modal: Crear reserva
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [datosExtra, setDatosExtra] = useState('');
  const [bookingError, setBookingError] = useState('');

  // Modal: Cancelar cotización
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Modal: Éxito al cancelar
  const [isCancelSuccessModalOpen, setIsCancelSuccessModalOpen] = useState(false);

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

  const handleCreateBooking = async () => {
    setActionLoading(true);
    setBookingError('');
    try {
      let extraParsed = {};
      if (datosExtra && datosExtra.trim() !== '') {
        try {
          extraParsed = JSON.parse(datosExtra);
        } catch(e) {
          extraParsed = { notas_agencia: datosExtra };
        }
      }

      const newReserva = await reservaService.createFromQuote(selectedCotizacion._id, {
        datos_extra: extraParsed,
      });
      setIsBookingModalOpen(false);
      navigate(`/agencia/reservas/${newReserva.data._id}`);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Error al convertir en reserva.';
      setBookingError(msg);
      setActionLoading(false);
    }
  };

  const handleCancelar = async () => {
    setCancelLoading(true);
    setCancelError('');
    try {
      await cotizacionService.cancelar(cancelTarget._id);
      setIsCancelModalOpen(false);
      setCancelTarget(null);
      setCancelMotivo('');
      fetchCotizaciones();
      setIsCancelSuccessModalOpen(true);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Error al cancelar la cotización.';
      setCancelError(msg);
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading && cotizaciones.length === 0) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mis Cotizaciones</h1>
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
            { label: 'Cancelada', value: 'cancelada' },
            { label: 'Vencida', value: 'vencida' },
            { label: 'Reserva Generada', value: 'reserva_generada' },
          ]}
        />
      </div>

      {cotizaciones.length === 0 ? (
        <EmptyState title="No hay cotizaciones" description="No tienes cotizaciones que coincidan con la búsqueda." />
      ) : (
        <Card>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>ID</TableCell>
                <TableCell isHeader>Producto</TableCell>
                <TableCell isHeader>Pasajeros</TableCell>
                <TableCell isHeader>Fechas</TableCell>
                <TableCell isHeader>Total Estimado</TableCell>
                <TableCell isHeader>Estado</TableCell>
                <TableCell isHeader>Acciones</TableCell>
              </TableRow>
            </thead>
            <tbody>
              {cotizaciones.map(c => (
                <TableRow key={c._id}>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>#{c._id.slice(-6).toUpperCase()}</div>
                  </TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>{c.producto_id?.nombre || 'Producto'}</div>
                    {c.producto_id?.tipo && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', textTransform: 'capitalize' }}>
                        {c.producto_id.tipo}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{c.pasajeros}</TableCell>
                  <TableCell>
                    {formatDate(c.fecha_inicio)} - {formatDate(c.fecha_fin)}
                  </TableCell>
                  <TableCell style={{ fontWeight: 600 }}>{formatCurrency(c.precio_total)}</TableCell>
                  <TableCell>
                    <Badge variant={c.estado}>{formatEstadoCotizacion(c.estado)}</Badge>
                    {c.estado === 'rechazada' && c.motivo_rechazo && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '0.25rem' }}>
                        Motivo: {c.motivo_rechazo}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.estado === 'aprobada' ? (
                      <Button size="sm" variant="success" onClick={() => { setSelectedCotizacion(c); setBookingError(''); setIsBookingModalOpen(true); }}>
                        <ShoppingBag size={14} /> Generar Reserva
                      </Button>
                    ) : c.estado === 'reserva_generada' ? (
                      <div title="Esta cotización ya fue convertida en reserva." style={{ display: 'inline-block', cursor: 'not-allowed' }}>
                        <Button size="sm" variant="success" disabled style={{ pointerEvents: 'none', opacity: 0.5 }}>
                          <ShoppingBag size={14} /> Generar Reserva
                        </Button>
                      </div>
                    ) : c.estado === 'pendiente' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>
                          Esperando confirmación
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setCancelTarget(c); setCancelError(''); setCancelMotivo(''); setIsCancelModalOpen(true); }}
                          style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                        >
                          <X size={14} /> Cancelar
                        </Button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Modal: Convertir en Reserva */}
      <Modal
        isOpen={isBookingModalOpen}
        onClose={() => { setIsBookingModalOpen(false); setBookingError(''); setDatosExtra(''); }}
        title="Convertir en Reserva"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsBookingModalOpen(false); setBookingError(''); setDatosExtra(''); }}>
              Cancelar
            </Button>
            <Button variant="success" onClick={handleCreateBooking} isLoading={actionLoading}>
              Confirmar Reserva
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {bookingError && <Alert variant="error">{bookingError}</Alert>}
          <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>Estás a punto de confirmar:</h4>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>{selectedCotizacion?.producto_id?.nombre}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontWeight: 600 }}>A pagar (Total):</span>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '1.25rem' }}>{formatCurrency(selectedCotizacion?.precio_total)}</span>
            </div>
          </div>
          <Input
            label="Notas adicionales (opcional)"
            value={datosExtra}
            onChange={e => setDatosExtra(e.target.value)}
            placeholder="Requerimientos especiales, preferencias..."
          />
        </div>
      </Modal>

      {/* Modal: Cancelar cotización */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => { setIsCancelModalOpen(false); setCancelError(''); setCancelMotivo(''); }}
        title="Cancelar Cotización"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsCancelModalOpen(false); setCancelError(''); setCancelMotivo(''); }}>
              Volver
            </Button>
            <Button
              onClick={handleCancelar}
              isLoading={cancelLoading}
              style={{ backgroundColor: 'var(--color-error, #DC2626)', borderColor: 'var(--color-error, #DC2626)' }}
            >
              Confirmar cancelación
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cancelError && <Alert variant="error">{cancelError}</Alert>}
          <p style={{ margin: 0, color: 'var(--color-text-soft)' }}>
            ¿Estás seguro de que deseas cancelar la cotización{' '}
            <strong style={{ color: 'var(--color-text)' }}>#{cancelTarget?._id.slice(-6).toUpperCase()}</strong>?{' '}
            Esta acción no puede revertirse.
          </p>
          <Input
            label="Motivo de cancelación (opcional)"
            value={cancelMotivo}
            onChange={e => setCancelMotivo(e.target.value)}
            placeholder="Ej: Ya no necesito el servicio..."
          />
        </div>
      </Modal>

      {/* Modal: Éxito al cancelar */}
      <Modal
        isOpen={isCancelSuccessModalOpen}
        onClose={() => setIsCancelSuccessModalOpen(false)}
        title="Cotización Cancelada"
        footer={
          <Button onClick={() => setIsCancelSuccessModalOpen(false)}>Cerrar</Button>
        }
      >
        <Alert variant="success">
          La cotización fue cancelada exitosamente.
        </Alert>
      </Modal>
    </div>
  );
};
