import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle, Clock, CreditCard } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
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

const METODOS = [
  { value: 'transferencia', label: 'Transferencia Bancaria' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'otro', label: 'Otro' },
];

export const AgenciaReservaDetalle = () => {
  const { id } = useParams();
  const [reserva, setReserva] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagoForm, setPagoForm] = useState({
    metodo: 'transferencia',
    comprobante: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    notas: '',
  });

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

  const handleInformarPago = async () => {
    setError('');
    if (!pagoForm.metodo || !pagoForm.fecha_pago) {
      setError('El método de pago y la fecha son obligatorios.');
      return;
    }
    setActionLoading(true);
    try {
      await reservaService.informarPago(id, {
        metodo: pagoForm.metodo,
        comprobante: pagoForm.comprobante || undefined,
        fecha_pago: pagoForm.fecha_pago,
        monto: toFloat(reserva.precio_final),
        notas: pagoForm.notas || undefined,
      });
      setIsModalOpen(false);
      fetchReserva();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al informar el pago.');
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
  const rechazo = reserva.rechazo_datos;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/agencia/reservas" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem', color: 'var(--color-text-soft)' }}>
            <ArrowLeft size={16} /> Volver a mis reservas
          </Link>
          <h1 className="page-title">Reserva #{reserva._id?.slice(-6).toUpperCase()}</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Badge variant={reserva.estado} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
            {formatEstadoReserva(reserva.estado)}
          </Badge>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div>
          {/* Info del servicio */}
          <Card style={{ marginBottom: '1.5rem' }}>
            <CardHeader><h3>Información del Servicio</h3></CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Producto</p>
                  <p style={{ fontWeight: 600, fontSize: '1.125rem' }}>{reserva.producto_id?.nombre || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Fechas</p>
                  <p style={{ fontWeight: 500 }}>{formatDate(reserva.fecha_inicio)} al {formatDate(reserva.fecha_fin)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Pasajeros</p>
                  <p style={{ fontWeight: 500 }}>{reserva.pasajeros} {reserva.pasajeros === 1 ? 'persona' : 'personas'}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Tipo</p>
                  <p style={{ fontWeight: 500, textTransform: 'capitalize' }}>{reserva.producto_id?.tipo || '—'}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Estado de pago informado */}
          {reserva.estado === 'pago_informado' && pid && (
            <Card style={{ marginBottom: '1.5rem', borderColor: '#F59E0B', borderWidth: '2px' }}>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <Clock size={20} style={{ color: '#D97706' }} />
                  <h3 style={{ margin: 0, color: '#92400E' }}>Pago en Verificación</h3>
                </div>
                <p style={{ color: 'var(--color-text-soft)', margin: '0 0 1rem 0', fontSize: '0.875rem' }}>
                  El mayorista está verificando tu pago. Te notificaremos cuando sea confirmado.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#FFFBEB', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Método</p>
                    <p style={{ fontWeight: 500, margin: 0, textTransform: 'capitalize' }}>{pid.metodo}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Comprobante</p>
                    <p style={{ fontWeight: 500, margin: 0 }}>{pid.comprobante || '—'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Fecha del pago</p>
                    <p style={{ fontWeight: 500, margin: 0 }}>{pid.fecha_pago ? formatDate(pid.fecha_pago) : '—'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Monto informado</p>
                    <p style={{ fontWeight: 600, margin: 0 }}>{formatCurrency(toFloat(pid.monto))}</p>
                  </div>
                  {pid.notas && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Notas</p>
                      <p style={{ fontWeight: 500, margin: 0, fontStyle: 'italic' }}>{pid.notas}</p>
                    </div>
                  )}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 0.25rem' }}>Informado el</p>
                    <p style={{ fontWeight: 500, margin: 0 }}>{pid.informado_at ? formatDateTime(pid.informado_at) : '—'}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Pagos confirmados por el mayorista */}
          <Card>
            <CardHeader><h3>Pagos Confirmados</h3></CardHeader>
            <CardBody>
              {pagos.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {pagos.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#F8FAFC', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>{formatCurrency(toFloat(p.monto))}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', margin: 0, textTransform: 'capitalize' }}>
                          {p.metodo || 'N/A'} — Ref: {p.comprobante || 'N/A'}
                        </p>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>
                        {formatDateTime(p.fecha_pago)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-soft)', margin: 0 }}>
                  {reserva.estado === 'pago_informado'
                    ? 'Tu pago está siendo verificado por el mayorista.'
                    : 'Aún no hay pagos confirmados en esta reserva.'}
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div>
          {/* Estado de cuenta */}
          <Card style={{ marginBottom: '1.5rem', borderColor: 'var(--color-primary)' }}>
            <CardBody>
              <h3 style={{ margin: '0 0 1rem 0' }}>Estado de Cuenta</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--color-text-soft)' }}>Total a abonar:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(precioFinal)}</span>
              </div>
              <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Saldo Pendiente:</span>
                <span style={{ fontWeight: 700, fontSize: '1.25rem', color: saldo > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {formatCurrency(saldo)}
                </span>
              </div>
            </CardBody>
          </Card>

          {/* Acción: informar pago */}
          {reserva.estado === 'pendiente_pago' && (
            <Card style={{ marginBottom: '1.5rem' }}>
              <CardBody>
                {rechazo && (
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', background: '#FEE2E2', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', alignItems: 'flex-start' }}>
                    <AlertCircle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <p style={{ fontWeight: 600, color: '#991B1B', margin: '0 0 0.25rem', fontSize: '0.875rem' }}>Pago rechazado</p>
                      <p style={{ color: '#991B1B', margin: 0, fontSize: '0.875rem' }}>{rechazo.motivo}</p>
                      {rechazo.rechazado_at && (
                        <p style={{ color: '#B91C1C', margin: '0.25rem 0 0', fontSize: '0.75rem' }}>{formatDateTime(rechazo.rechazado_at)}</p>
                      )}
                    </div>
                  </div>
                )}
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
                  Una vez realizada la transferencia, informá al mayorista para que pueda confirmar tu pago.
                </p>
                <Button style={{ width: '100%' }} onClick={() => setIsModalOpen(true)}>
                  <CreditCard size={16} /> Informar Pago Realizado
                </Button>
              </CardBody>
            </Card>
          )}

          {reserva.estado === 'pagada' && (
            <Card style={{ marginBottom: '1.5rem', borderColor: '#22C55E' }}>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CheckCircle size={20} style={{ color: '#16A34A' }} />
                  <div>
                    <p style={{ fontWeight: 600, color: '#166534', margin: 0 }}>Pago confirmado</p>
                    <p style={{ color: 'var(--color-text-soft)', margin: 0, fontSize: '0.875rem' }}>El mayorista verificó y confirmó tu pago.</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader><h3>Timeline</h3></CardHeader>
            <CardBody>
              <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '7px', width: '2px', backgroundColor: 'var(--color-border)' }}></div>
                {(reserva.historial ?? []).map((h, i) => (
                  <div key={i} style={{ position: 'relative', marginBottom: '1.5rem' }}>
                    <div style={{ position: 'absolute', left: '-1.5rem', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', border: '4px solid var(--color-surface)' }}></div>
                    <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{formatEstadoReserva(h.estado_nuevo)}</div>
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

      {/* Modal Informar Pago */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setError(''); }}
        title="Informar Pago Realizado"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsModalOpen(false); setError(''); }}>Cancelar</Button>
            <Button onClick={handleInformarPago} isLoading={actionLoading}>Confirmar</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ padding: '0.75rem 1rem', background: '#FEE2E2', borderRadius: 'var(--radius-sm)', color: '#991B1B', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <div>
            <label className="input-label">Método de pago *</label>
            <select
              className="input-control"
              value={pagoForm.metodo}
              onChange={e => setPagoForm({ ...pagoForm, metodo: e.target.value })}
            >
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <Input
            label="Número de comprobante"
            value={pagoForm.comprobante}
            onChange={e => setPagoForm({ ...pagoForm, comprobante: e.target.value })}
            placeholder="Ej: 0012345678"
          />

          <Input
            label="Fecha del pago *"
            type="date"
            value={pagoForm.fecha_pago}
            onChange={e => setPagoForm({ ...pagoForm, fecha_pago: e.target.value })}
          />

          <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>Monto</span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>{formatCurrency(precioFinal)}</span>
          </div>

          <Input
            label="Notas adicionales"
            value={pagoForm.notas}
            onChange={e => setPagoForm({ ...pagoForm, notas: e.target.value })}
            placeholder="Información adicional para el mayorista..."
          />
        </div>
      </Modal>
    </div>
  );
};
