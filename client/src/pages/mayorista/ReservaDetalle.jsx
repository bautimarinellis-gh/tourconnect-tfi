import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, Lock, AlertTriangle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { useToast } from '../../components/ui/Toast';
import { ReservaTimeline } from '../../components/shared/ReservaTimeline';
import { EstadoCuentaCard } from '../../components/shared/EstadoCuentaCard';
import { formatCurrency, formatDateTime, formatDate, formatEstadoReserva } from '../../utils/formatters';
import { toFloat } from '../../utils/money';
import reservaService from '../../services/reservaService';

const MOTIVOS_RAPIDOS = ['Monto incorrecto', 'No recibí el pago', 'Datos incorrectos', 'Comprobante inválido'];

export const MayoristaReservaDetalle = () => {
  const { id } = useParams();
  const toast = useToast();
  const [reserva, setReserva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [modalError, setModalError] = useState('');

  const fetchReserva = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reservaService.getById(id);
      setReserva(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReserva();
  }, [fetchReserva]);

  const handleCancelar = async () => {
    if (!cancelReason.trim()) {
      setCancelError('El motivo de cancelación es obligatorio.');
      return;
    }
    setActionLoading(true);
    setCancelError('');
    try {
      await reservaService.cancelar(id, cancelReason);
      setIsCancelModalOpen(false);
      setCancelReason('');
      fetchReserva();
    } catch (err) {
      setCancelError(err.response?.data?.message || 'Error al cancelar la reserva.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCerrar = async () => {
    setActionLoading(true);
    try {
      await reservaService.cerrar(id);
      fetchReserva();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al cerrar la reserva.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmarPago = async () => {
    setActionLoading(true);
    try {
      await reservaService.confirmarPago(id);
      setIsConfirmModalOpen(false);
      fetchReserva();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al confirmar el pago.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRechazarPago = async () => {
    setModalError('');
    if (!rejectReason.trim()) {
      setModalError('El motivo del rechazo es obligatorio.');
      return;
    }
    setActionLoading(true);
    try {
      await reservaService.rechazarPago(id, rejectReason);
      setIsRejectModalOpen(false);
      setRejectReason('');
      fetchReserva();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Error al rechazar pago');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !reserva) return <Spinner center size="lg" />;

  const precioFinal = toFloat(reserva.precio_final);
  const pagos = reserva.pagos ?? [];
  const totalPagado = pagos.filter(p => !p.rechazado).reduce((acc, p) => acc + toFloat(p.monto), 0);
  const saldo = ['pagada', 'cerrada'].includes(reserva.estado) ? 0 : precioFinal - totalPagado;
  const pid = reserva.pago_informado_datos;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/mayorista/reservas" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem', color: 'var(--color-text-soft)' }}>
            <ArrowLeft size={16} /> Volver a reservas
          </Link>
          <h1 className="page-title">Reserva #{reserva._id?.slice(-6).toUpperCase()}</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge variant={reserva.estado} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
            {formatEstadoReserva(reserva.estado)}
          </Badge>

          {reserva.estado === 'pagada' && (
            <Button variant="secondary" onClick={handleCerrar} isLoading={actionLoading}>
              <Lock size={16} /> Cerrar Reserva
            </Button>
          )}

          {!['cerrada', 'cancelada'].includes(reserva.estado) && (
            <Button variant="danger" onClick={() => setIsCancelModalOpen(true)}>
              <X size={16} /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Card de acción para pago_informado */}
      {reserva.estado === 'pago_informado' && pid && (
        <Card style={{ marginBottom: '1.5rem', borderColor: '#F59E0B', borderWidth: '2px' }}>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <AlertTriangle size={22} style={{ color: '#D97706', flexShrink: 0 }} />
              <div>
                <h3 style={{ margin: '0 0 0.25rem', color: '#92400E' }}>Pago informado por la agencia</h3>
                <p style={{ margin: 0, color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>
                  Verificá en tu cuenta bancaria antes de confirmar.
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', background: '#FFFBEB', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem' }}>
              <div>
                <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Agencia</p>
                <p style={{ color: '#1F2937', fontWeight: 600, margin: 0 }}>{reserva.agencia_id?.nombre || '—'}</p>
              </div>
              <div>
                <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Método de pago</p>
                <p style={{ color: '#1F2937', fontWeight: 600, margin: 0, textTransform: 'capitalize' }}>{pid.metodo}</p>
              </div>
              <div>
                <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Comprobante</p>
                <p style={{ color: '#1F2937', fontWeight: 600, margin: 0 }}>{pid.comprobante || '—'}</p>
              </div>
              <div>
                <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Fecha del pago</p>
                <p style={{ color: '#1F2937', fontWeight: 600, margin: 0 }}>{pid.fecha_pago ? formatDate(pid.fecha_pago) : '—'}</p>
              </div>
              <div>
                <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Monto informado</p>
                <p style={{ color: '#1F2937', fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>{formatCurrency(toFloat(pid.monto))}</p>
              </div>
              <div>
                <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Informado el</p>
                <p style={{ color: '#1F2937', fontWeight: 600, margin: 0 }}>{pid.informado_at ? formatDateTime(pid.informado_at) : '—'}</p>
              </div>
              {pid.notas && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ color: '#92400E', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Notas</p>
                  <p style={{ color: '#1F2937', fontWeight: 500, margin: 0, fontStyle: 'italic' }}>{pid.notas}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <Button variant="danger" onClick={() => { setModalError(''); setIsRejectModalOpen(true); }}>
                <X size={16} /> Rechazar Pago
              </Button>
              <Button onClick={() => setIsConfirmModalOpen(true)}>
                <Check size={16} /> Confirmar Pago
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Columna Izquierda */}
        <div>
          <Card style={{ marginBottom: '1.5rem' }}>
            <CardHeader><h3>Información del Servicio</h3></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Producto</p>
                  <p style={{ fontWeight: 600, fontSize: '1.125rem' }}>{reserva.producto_id?.nombre || 'N/A'}</p>
                  {reserva.producto_id?.tipo && (
                    <Badge style={{ textTransform: 'capitalize' }}>{reserva.producto_id.tipo}</Badge>
                  )}
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Agencia</p>
                  <p style={{ fontWeight: 500 }}>{reserva.agencia_id?.nombre || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Fechas</p>
                  <p style={{ fontWeight: 500 }}>{formatDate(reserva.fecha_inicio)} al {formatDate(reserva.fecha_fin)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Pasajeros</p>
                  <p style={{ fontWeight: 500 }}>{reserva.pasajeros} personas</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><h3>Pagos Registrados</h3></CardHeader>
            <CardBody>
              {pagos.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {pagos.map((p) => (
                    <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', opacity: p.rechazado ? 0.6 : 1 }}>
                      <div>
                        <p style={{ fontWeight: 600, margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ textDecoration: p.rechazado ? 'line-through' : 'none' }}>{formatCurrency(toFloat(p.monto))}</span>
                          {p.rechazado && <Badge variant="error">Rechazado</Badge>}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', margin: 0, textTransform: 'capitalize' }}>
                          {p.metodo || 'N/A'} — Comp: {p.comprobante || 'N/A'}
                        </p>
                        {p.rechazado && p.motivo_rechazo && (
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-error, #DC2626)', margin: '0.25rem 0 0' }}>
                            Motivo: {p.motivo_rechazo}
                          </p>
                        )}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>
                        {formatDateTime(p.fecha_pago)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-soft)', margin: 0 }}>No hay pagos registrados aún.</p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Columna Derecha */}
        <div>
          <EstadoCuentaCard precioFinal={precioFinal} totalPagado={totalPagado} saldo={saldo} showAbonado />
          <ReservaTimeline historial={reserva.historial} />
        </div>
      </div>

      {/* Modal Cancelar */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => { setIsCancelModalOpen(false); setCancelReason(''); setCancelError(''); }}
        title="Cancelar Reserva"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsCancelModalOpen(false); setCancelReason(''); setCancelError(''); }}>Atrás</Button>
            <Button variant="danger" onClick={handleCancelar} isLoading={actionLoading}>Confirmar Cancelación</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cancelError && <Alert variant="error">{cancelError}</Alert>}
          <Input
            label="Motivo de la cancelación *"
            value={cancelReason}
            onChange={e => { setCancelReason(e.target.value); setCancelError(''); }}
            placeholder="Ingresá el motivo de cancelación"
          />
        </div>
      </Modal>

      {/* Modal Confirmar Pago */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirmar Pago"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsConfirmModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmarPago} isLoading={actionLoading}>
              <Check size={16} /> Confirmar
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0 }}>
            ¿Confirmás que recibiste el pago de <strong>{formatCurrency(toFloat(pid?.monto))}</strong>?
          </p>
          <div style={{ padding: '0.75rem 1rem', background: '#FEF3C7', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', color: '#92400E' }}>
            Verificá en tu cuenta bancaria antes de confirmar. Esta acción no se puede deshacer.
          </div>
        </div>
      </Modal>

      {/* Modal Rechazar Pago */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => { setIsRejectModalOpen(false); setRejectReason(''); setModalError(''); }}
        title="Rechazar Pago"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsRejectModalOpen(false); setRejectReason(''); setModalError(''); }}>Cancelar</Button>
            <Button variant="danger" onClick={handleRechazarPago} isLoading={actionLoading}>
              <X size={16} /> Rechazar
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {modalError && (
            <div style={{ padding: '0.75rem 1rem', background: '#FEE2E2', borderRadius: 'var(--radius-sm)', color: '#991B1B', fontSize: '0.875rem' }}>
              {modalError}
            </div>
          )}
          <div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>Sugerencias rápidas:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {MOTIVOS_RAPIDOS.map(m => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setRejectReason(m)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '9999px',
                    border: '1px solid var(--color-border)',
                    background: rejectReason === m ? '#FEE2E2' : 'var(--color-bg)',
                    color: rejectReason === m ? '#991B1B' : 'var(--color-text)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Motivo del rechazo *"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Explicá el motivo del rechazo..."
          />
        </div>
      </Modal>
    </div>
  );
};
