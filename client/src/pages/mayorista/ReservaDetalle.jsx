import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, CreditCard, Lock, AlertTriangle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { formatCurrency, formatDateTime, formatDate, formatEstadoReserva } from '../../utils/formatters';
import reservaService from '../../services/reservaService';

const toFloat = (val) => {
  if (!val) return 0;
  if (val?.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(val.toString());
};

const MOTIVOS_RAPIDOS = ['Monto incorrecto', 'No recibí el pago', 'Datos incorrectos', 'Comprobante inválido'];

export const MayoristaReservaDetalle = () => {
  const { id } = useParams();
  const [reserva, setReserva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({ monto: '', metodo: 'transferencia', comprobante: '' });

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [modalError, setModalError] = useState('');

  const fetchReserva = async () => {
    setLoading(true);
    try {
      const data = await reservaService.getById(id);
      setReserva(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReserva();
  }, [id]);

  const handleCancelar = async () => {
    if (!cancelReason.trim()) {
      return;
    }
    setActionLoading(true);
    try {
      await reservaService.cancelar(id, cancelReason);
      setIsCancelModalOpen(false);
      setCancelReason('');
      fetchReserva();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al cancelar');
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
      alert(err.response?.data?.message || 'Error al cerrar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegistrarPago = async () => {
    if (!paymentData.monto || Number(paymentData.monto) <= 0) return;
    setActionLoading(true);
    try {
      await reservaService.addPayment(id, {
        monto: Number(paymentData.monto),
        metodo: paymentData.metodo,
        comprobante: paymentData.comprobante || undefined,
        fecha_pago: new Date().toISOString(),
      });
      await reservaService.pagar(id);
      setIsPaymentModalOpen(false);
      setPaymentData({ monto: '', metodo: 'transferencia', comprobante: '' });
      fetchReserva();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al registrar pago');
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
      alert(err.response?.data?.message || 'Error al confirmar pago');
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
  const totalPagado = pagos.reduce((acc, p) => acc + toFloat(p.monto), 0);
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

          {reserva.estado === 'pendiente_pago' && (
            <Button onClick={() => setIsPaymentModalOpen(true)} isLoading={actionLoading}>
              <CreditCard size={16} /> Registrar Pago
            </Button>
          )}

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
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Agencia</p>
                <p style={{ fontWeight: 600, margin: 0 }}>{reserva.agencia_id?.nombre || '—'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Método de pago</p>
                <p style={{ fontWeight: 600, margin: 0, textTransform: 'capitalize' }}>{pid.metodo}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Comprobante</p>
                <p style={{ fontWeight: 600, margin: 0 }}>{pid.comprobante || '—'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Fecha del pago</p>
                <p style={{ fontWeight: 600, margin: 0 }}>{pid.fecha_pago ? formatDate(pid.fecha_pago) : '—'}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Monto informado</p>
                <p style={{ fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>{formatCurrency(toFloat(pid.monto))}</p>
              </div>
              <div>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Informado el</p>
                <p style={{ fontWeight: 600, margin: 0 }}>{pid.informado_at ? formatDateTime(pid.informado_at) : '—'}</p>
              </div>
              {pid.notas && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Notas</p>
                  <p style={{ fontWeight: 500, margin: 0, fontStyle: 'italic' }}>{pid.notas}</p>
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
                  {pagos.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>{formatCurrency(toFloat(p.monto))}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', margin: 0, textTransform: 'capitalize' }}>
                          {p.metodo || 'N/A'} — Comp: {p.comprobante || 'N/A'}
                        </p>
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
          <Card style={{ marginBottom: '1.5rem', borderColor: 'var(--color-primary)' }}>
            <CardBody>
              <h3 style={{ margin: '0 0 1rem 0' }}>Estado de Cuenta</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--color-text-soft)' }}>Total:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(precioFinal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ color: 'var(--color-text-soft)' }}>Abonado:</span>
                <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{formatCurrency(totalPagado)}</span>
              </div>
              <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Saldo Pendiente:</span>
                <span style={{ fontWeight: 700, fontSize: '1.25rem', color: saldo > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {formatCurrency(saldo)}
                </span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><h3>Historial de Estados</h3></CardHeader>
            <CardBody>
              <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '7px', width: '2px', backgroundColor: 'var(--color-border)' }}></div>
                {(reserva.historial ?? []).map((h, i) => (
                  <div key={i} style={{ position: 'relative', marginBottom: '1.5rem' }}>
                    <div style={{ position: 'absolute', left: '-1.5rem', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', border: '4px solid var(--color-surface)' }}></div>
                    <div style={{ fontWeight: 600 }}>{formatEstadoReserva(h.estado_nuevo)}</div>
                    {h.comentario && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', fontStyle: 'italic', marginTop: '0.1rem' }}>{h.comentario}</div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>{formatDateTime(h.created_at)}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Modal Cancelar */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancelar Reserva"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCancelModalOpen(false)}>Atrás</Button>
            <Button variant="danger" onClick={handleCancelar} isLoading={actionLoading}>Confirmar Cancelación</Button>
          </>
        }
      >
        <Input
          label="Motivo de la cancelación *"
          value={cancelReason}
          onChange={e => setCancelReason(e.target.value)}
          placeholder="Ingresá el motivo de cancelación"
        />
      </Modal>

      {/* Modal Registrar Pago (flujo antiguo) */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Registrar Pago"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>Atrás</Button>
            <Button onClick={handleRegistrarPago} isLoading={actionLoading}>Registrar</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Monto *"
            type="number"
            value={paymentData.monto}
            onChange={e => setPaymentData({ ...paymentData, monto: e.target.value })}
            placeholder={formatCurrency(precioFinal)}
          />
          <div>
            <label className="input-label">Método de pago</label>
            <select
              className="input-control"
              value={paymentData.metodo}
              onChange={e => setPaymentData({ ...paymentData, metodo: e.target.value })}
            >
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <Input
            label="Comprobante"
            value={paymentData.comprobante}
            onChange={e => setPaymentData({ ...paymentData, comprobante: e.target.value })}
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
