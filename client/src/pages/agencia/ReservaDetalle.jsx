import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle, Clock, CreditCard, RefreshCw, Wallet } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { ReservaTimeline } from '../../components/shared/ReservaTimeline';
import { EstadoCuentaCard } from '../../components/shared/EstadoCuentaCard';
import { formatCurrency, formatDateTime, formatFecha, formatRangoFechas, formatEstadoReserva } from '../../utils/formatters';
import { toFloat } from '../../utils/money';
import { todayDateInput } from '../../utils/dateRanges';
import reservaService from '../../services/reservaService';

const METODOS = [
  { value: 'transferencia', label: 'Transferencia Bancaria' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
];

// Mercado Pago cobra en pesos; los precios del sistema están en dólares.
const formatPesos = (monto) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(monto ?? 0);

// Motivos de rechazo más comunes de MP (status_detail).
const MOTIVOS_RECHAZO_MP = {
  cc_rejected_insufficient_amount: 'La tarjeta no tiene fondos suficientes.',
  cc_rejected_bad_filled_security_code: 'El código de seguridad es incorrecto.',
  cc_rejected_bad_filled_date: 'La fecha de vencimiento es incorrecta.',
  cc_rejected_bad_filled_other: 'Hay un dato de la tarjeta mal cargado.',
  cc_rejected_call_for_authorize: 'La tarjeta requiere autorizar el pago con el banco.',
  cc_rejected_card_disabled: 'La tarjeta está deshabilitada.',
  cc_rejected_duplicated_payment: 'Ya hiciste un pago por el mismo monto.',
  cc_rejected_high_risk: 'Mercado Pago rechazó el pago por seguridad.',
  cc_rejected_other_reason: 'El banco rechazó el pago.',
};
const motivoRechazoMP = (detalle) => MOTIVOS_RECHAZO_MP[detalle] || 'Mercado Pago rechazó el pago.';

const MENSAJES_VERIFICACION = {
  acreditado: { variant: 'success', texto: 'Pago acreditado por Mercado Pago. Tu reserva ya está pagada.' },
  pendiente: { variant: 'warning', texto: 'Mercado Pago recibió tu pago y lo está acreditando. La reserva se actualiza sola cuando se acredite.' },
  sin_cambios: { variant: 'info', texto: 'El pago ya estaba registrado.' },
  sin_pago: { variant: 'info', texto: 'Mercado Pago todavía no registra un pago para esta reserva.' },
  monto_invalido: { variant: 'error', texto: 'El monto cobrado no coincide con el de la reserva. Contactá al mayorista.' },
  no_aplicable: { variant: 'error', texto: 'El pago se aprobó, pero la reserva ya no admite pagos. Contactá al mayorista para la devolución.' },
};

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
    // Hoy en hora local: toISOString() daría el día siguiente después de las 21 hs en Argentina.
    fecha_pago: todayDateInput(),
    notas: '',
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [pagandoMP, setPagandoMP] = useState(false);
  const [verificandoMP, setVerificandoMP] = useState(false);
  const [avisoMP, setAvisoMP] = useState(null);
  const retornoProcesado = useRef(false);
  const consultandoMP = useRef(false);

  // silencioso: refresca sin el spinner de página completa (al volver a la pestaña).
  const fetchReserva = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    try {
      const data = await reservaService.getById(id);
      setReserva(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [id]);

  // Devuelve el resultado del servidor. En modo silencioso (consultas
  // automáticas) solo avisa si el pago cambió de estado.
  const verificarPagoMP = useCallback(async (paymentId, { silencioso = false } = {}) => {
    if (!silencioso) setVerificandoMP(true);
    try {
      const r = await reservaService.verificarPagoMP(id, paymentId);
      const mensaje = r?.resultado === 'rechazado'
        ? { variant: 'error', texto: motivoRechazoMP(r.status_detail) }
        : MENSAJES_VERIFICACION[r?.resultado];
      if (!silencioso || ['acreditado', 'pendiente'].includes(r?.resultado)) setAvisoMP(mensaje || null);
      return r;
    } catch (err) {
      if (!silencioso) {
        setAvisoMP({ variant: 'error', texto: err.response?.data?.message || 'No se pudo consultar el pago en Mercado Pago.' });
      }
      return null;
    } finally {
      if (!silencioso) setVerificandoMP(false);
    }
  }, [id]);

  useEffect(() => {
    // Al volver del checkout, MP agrega payment_id (o collection_id) a la URL.
    // El servidor consulta el estado real en MP; los parámetros se limpian
    // para que un F5 no repita la verificación.
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    if (searchParams.has('preference_id') || searchParams.has('payment_id')) {
      setSearchParams({}, { replace: true });
    }
    if (paymentId && paymentId !== 'null') {
      // El ref evita verificar dos veces el mismo pago (StrictMode monta dos veces).
      if (retornoProcesado.current !== paymentId) {
        retornoProcesado.current = paymentId;
        verificarPagoMP(paymentId).then(() => fetchReserva());
      }
      return;
    }
    fetchReserva();
  }, [fetchReserva, verificarPagoMP, searchParams, setSearchParams]);

  // Hay un pago de MP sin resolver: un checkout abierto (o rechazado, que en
  // la misma pantalla de MP se puede reintentar con otra tarjeta) o un pago
  // pendiente de acreditación.
  const intentoAbierto = ['creado', 'rechazado'].includes(reserva?.pasarela?.ultimo_intento?.estado);
  const hayPagoMPAbierto = Boolean(reserva?.pasarela?.disponible) && (
    (reserva?.estado === 'pendiente_pago' && intentoAbierto)
    || (reserva?.estado === 'pago_informado' && reserva?.pago_informado_datos?.origen === 'pasarela')
  );

  const consultarMPEnSegundoPlano = useCallback(async () => {
    if (consultandoMP.current) return;
    consultandoMP.current = true;
    try {
      const r = await verificarPagoMP(undefined, { silencioso: true });
      if (r && !['sin_pago', 'sin_cambios'].includes(r.resultado)) await fetchReserva({ silencioso: true });
    } finally {
      consultandoMP.current = false;
    }
  }, [verificarPagoMP, fetchReserva]);

  // Sin auto_return (MP no lo acepta con back_urls a localhost) la agencia
  // no vuelve sola del checkout, y aunque vuelva, MP puede no traer el
  // payment_id. Por eso, si hay un pago abierto, se consulta a MP al cargar
  // la reserva y cada vez que la pestaña vuelve a estar visible.
  useEffect(() => {
    if (!hayPagoMPAbierto) return undefined;
    consultarMPEnSegundoPlano();
    const alVolver = () => { if (document.visibilityState === 'visible') consultarMPEnSegundoPlano(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [hayPagoMPAbierto, consultarMPEnSegundoPlano]);

  const handlePagarMP = async () => {
    setAvisoMP(null);
    setPagandoMP(true);
    try {
      const { url_checkout: url } = await reservaService.iniciarCheckoutMP(id);
      // En otra pestaña, así TourConnect queda abierto y se actualiza al volver.
      const pestana = window.open(url, '_blank');
      if (!pestana) {
        window.location.href = url; // ventanas emergentes bloqueadas
        return;
      }
      pestana.opener = null;
      setAvisoMP({
        variant: 'info',
        texto: 'Completá el pago en la pestaña de Mercado Pago. Cuando termines, volvé a esta pestaña: la reserva se actualiza sola.',
      });
      fetchReserva({ silencioso: true });
    } catch (err) {
      setAvisoMP({ variant: 'error', texto: err.response?.data?.message || 'No se pudo iniciar el pago con Mercado Pago.' });
    } finally {
      setPagandoMP(false);
    }
  };

  const handleActualizarPagoMP = async () => {
    await verificarPagoMP();
    fetchReserva();
  };

  const handleInformarPago = async () => {
    setError('');
    if (!pagoForm.metodo || !pagoForm.fecha_pago) {
      setError('El método de pago y la fecha son obligatorios.');
      return;
    }
    if (pagoForm.comprobante && !/^\d+$/.test(pagoForm.comprobante)) {
      setError('El número de comprobante solo puede contener números.');
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
  const pid = reserva.pago_informado_datos;
  const pagos = reserva.pagos ?? [];
  // El pago en verificación (manual o pendiente de acreditación en MP) todavía no cuenta como pagado.
  const pagosConfirmados = pagos.filter(p => !p.rechazado && !p.devuelto && p._id !== pid?._id);
  const pagosDevueltos = pagos.filter(p => p.devuelto);
  const totalPagado = pagosConfirmados.reduce((acc, p) => acc + toFloat(p.monto), 0);
  const saldo = ['pagada', 'cerrada'].includes(reserva.estado) ? 0 : precioFinal - totalPagado;

  const rechazo = reserva.rechazo_datos;
  const pasarela = reserva.pasarela ?? {};
  const intentoMP = pasarela.ultimo_intento;
  const pidEsPasarela = pid?.origen === 'pasarela';
  const pagadaPorMP = pagosConfirmados.some(p => p.origen === 'pasarela');
  // El rechazo del intento solo se muestra si es posterior al último rechazo manual.
  const intentoRechazado = intentoMP?.estado === 'rechazado'
    && (!rechazo?.rechazado_at || new Date(intentoMP.created_at) > new Date(rechazo.rechazado_at));
  const montoArs = pasarela.tipo_cambio ? Math.round(precioFinal * pasarela.tipo_cambio * 100) / 100 : null;

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

      {avisoMP && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Alert variant={avisoMP.variant} title="Mercado Pago">{avisoMP.texto}</Alert>
        </div>
      )}

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
                  <p style={{ fontWeight: 500 }}>{formatRangoFechas(reserva.fecha_inicio, reserva.fecha_fin, ' al ')}</p>
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
            <Card style={{ marginBottom: '1.5rem', borderColor: 'var(--color-warning)', borderWidth: '2px' }}>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <Clock size={20} style={{ color: 'var(--color-warning)' }} />
                  <h3 style={{ margin: 0, color: 'var(--color-warning)' }}>
                    {pidEsPasarela ? 'Pago pendiente de acreditación' : 'Pago en Verificación'}
                  </h3>
                </div>
                <p style={{ color: 'var(--color-text-soft)', margin: '0 0 1rem 0', fontSize: '0.875rem' }}>
                  {pidEsPasarela
                    ? 'Mercado Pago recibió tu pago y lo está acreditando. La reserva pasa a pagada sola cuando se acredite.'
                    : 'El mayorista está verificando tu pago. Te notificaremos cuando sea confirmado.'}
                </p>
                {pidEsPasarela && pasarela.disponible && (
                  <Button variant="secondary" size="sm" onClick={handleActualizarPagoMP} isLoading={verificandoMP} style={{ marginBottom: '1rem' }}>
                    <RefreshCw size={14} /> Consultar estado en Mercado Pago
                  </Button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'var(--color-warning-soft)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
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
                    <p style={{ fontWeight: 500, margin: 0 }}>{pid.fecha_pago ? formatFecha(pid.fecha_pago) : '—'}</p>
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
                    <p style={{ fontWeight: 500, margin: 0 }}>{pid.created_at ? formatDateTime(pid.created_at) : '—'}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Pagos confirmados por el mayorista. Los rechazados no se
              muestran acá: ya se avisan aparte con el banner de "Pago
              rechazado" más abajo, y esta lista es específicamente de
              pagos confirmados. */}
          <Card>
            <CardHeader><h3>Pagos Confirmados</h3></CardHeader>
            <CardBody>
              {pagosConfirmados.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {pagosConfirmados.map((p) => (
                    <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>{formatCurrency(toFloat(p.monto))}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', margin: 0, textTransform: 'capitalize' }}>
                          {p.origen === 'pasarela' ? 'Mercado Pago' : (p.metodo || 'N/A')} — Ref: {p.comprobante || 'N/A'}
                          {p.pasarela?.monto_ars ? ` — ${formatPesos(p.pasarela.monto_ars)}` : ''}
                        </p>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--color-text-soft)' }}>
                        {formatFecha(p.fecha_pago)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-soft)', margin: 0 }}>
                  {reserva.estado === 'pago_informado'
                    ? (pidEsPasarela
                      ? 'Tu pago está pendiente de acreditación en Mercado Pago.'
                      : 'Tu pago está siendo verificado por el mayorista.')
                    : 'Aún no hay pagos confirmados en esta reserva.'}
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div>
          {/* Estado de cuenta */}
          <EstadoCuentaCard totalLabel="Total a abonar:" precioFinal={precioFinal} totalPagado={totalPagado} saldo={saldo} />

          {/* Acción: informar pago */}
          {reserva.estado === 'pendiente_pago' && (
            <Card style={{ marginBottom: '1.5rem' }}>
              <CardBody>
                {rechazo && (
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--color-error-soft)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', alignItems: 'flex-start' }}>
                    <AlertCircle size={18} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <p style={{ fontWeight: 600, color: 'var(--color-error)', margin: '0 0 0.25rem', fontSize: '0.875rem' }}>Pago rechazado</p>
                      <p style={{ color: 'var(--color-error)', margin: 0, fontSize: '0.875rem' }}>{rechazo.motivo}</p>
                      {rechazo.rechazado_at && (
                        <p style={{ color: 'var(--color-error)', margin: '0.25rem 0 0', fontSize: '0.75rem' }}>{formatDateTime(rechazo.rechazado_at)}</p>
                      )}
                    </div>
                  </div>
                )}
                {intentoRechazado && (
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--color-error-soft)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', alignItems: 'flex-start' }}>
                    <AlertCircle size={18} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <p style={{ fontWeight: 600, color: 'var(--color-error)', margin: '0 0 0.25rem', fontSize: '0.875rem' }}>Último intento con Mercado Pago rechazado</p>
                      <p style={{ color: 'var(--color-error)', margin: 0, fontSize: '0.875rem' }}>{motivoRechazoMP(intentoMP.status_detail)}</p>
                    </div>
                  </div>
                )}
                {pasarela.disponible && (
                  <>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', margin: '0 0 0.75rem 0' }}>
                      Pagá online y la reserva queda pagada al instante, sin esperar la confirmación del mayorista.
                    </p>
                    {montoArs !== null && (
                      <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem' }}>A cobrar en pesos</span>
                          <span style={{ fontWeight: 700 }}>{formatPesos(montoArs)}</span>
                        </div>
                        <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                          {formatCurrency(precioFinal)} × {formatPesos(pasarela.tipo_cambio)} por dólar
                        </p>
                      </div>
                    )}
                    <Button style={{ width: '100%', marginBottom: '0.5rem' }} onClick={handlePagarMP} isLoading={pagandoMP}>
                      <Wallet size={16} /> Pagar con Mercado Pago
                    </Button>
                    <p style={{ color: 'var(--color-text-soft)', fontSize: '0.75rem', margin: '0 0 1rem 0', textAlign: 'center' }}>
                      Entorno de prueba: no se mueve dinero real.
                    </p>
                  </>
                )}
                <p style={{ color: 'var(--color-text-soft)', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
                  {pasarela.disponible
                    ? 'Si pagaste por transferencia, efectivo o cheque, informalo para que el mayorista lo confirme.'
                    : 'Una vez realizada la transferencia, informá al mayorista para que pueda confirmar tu pago.'}
                </p>
                <Button variant={pasarela.disponible ? 'secondary' : 'primary'} style={{ width: '100%' }} onClick={() => setIsModalOpen(true)}>
                  <CreditCard size={16} /> {pasarela.disponible ? 'Informar Pago Manual' : 'Informar Pago Realizado'}
                </Button>
              </CardBody>
            </Card>
          )}

          {reserva.estado === 'pagada' && (
            <Card style={{ marginBottom: '1.5rem', borderColor: 'var(--color-success)' }}>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CheckCircle size={20} style={{ color: 'var(--color-success)' }} />
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--color-success)', margin: 0 }}>Pago confirmado</p>
                    <p style={{ color: 'var(--color-text-soft)', margin: 0, fontSize: '0.875rem' }}>
                      {pagadaPorMP ? 'Mercado Pago acreditó tu pago.' : 'El mayorista verificó y confirmó tu pago.'}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {reserva.estado === 'cancelada' && (
            <Card style={{ marginBottom: '1.5rem', borderColor: 'var(--color-error)' }}>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <AlertCircle size={20} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--color-error)', margin: 0 }}>Reserva cancelada</p>
                    {reserva.motivo_cancelacion && (
                      <p style={{ color: 'var(--color-text-soft)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>{reserva.motivo_cancelacion}</p>
                    )}
                    {pagosDevueltos.map(p => (
                      <p key={p._id} style={{ color: 'var(--color-text-soft)', margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                        {p.devolucion?.origen === 'pasarela'
                          ? (p.devolucion.simulada
                            ? `Devolución SIMULADA de ${formatCurrency(toFloat(p.monto))} por Mercado Pago (el sandbox no permite reembolsos por API).`
                            : `Se te devolvieron ${formatCurrency(toFloat(p.monto))} por Mercado Pago (reembolso N° ${p.devolucion.refund_id}).`)
                          : `El mayorista te devolvió ${formatCurrency(toFloat(p.monto))} por ${p.devolucion?.metodo || '—'}${p.devolucion?.comprobante ? ` (comp. ${p.devolucion.comprobante})` : ''}.`}
                      </p>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Timeline */}
          <ReservaTimeline historial={reserva.historial} title="Timeline" />
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
          {error && <Alert variant="error">{error}</Alert>}

          <div>
            <label className="input-label" htmlFor="agencia-metodo-pago">Método de pago *</label>
            <select
              id="agencia-metodo-pago"
              className="input-control"
              value={pagoForm.metodo}
              onChange={e => setPagoForm({ ...pagoForm, metodo: e.target.value })}
            >
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <Input
            label="Número de comprobante"
            inputMode="numeric"
            value={pagoForm.comprobante}
            onChange={e => setPagoForm({ ...pagoForm, comprobante: e.target.value.replace(/\D/g, '') })}
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
