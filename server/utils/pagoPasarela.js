const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Pago = require('../models/Pago');
const IntentoPago = require('../models/IntentoPago');
const { registrarCambioEstado } = require('./historialEstadoReserva');
const { registrarAuditoria } = require('./auditService');

/**
 * Aplica a la reserva el estado de un pago de Mercado Pago.
 *
 * Lo llaman el webhook y el endpoint /verificar (cuando la agencia vuelve del
 * checkout). Los dos pueden llegar para el mismo pago, y MP repite webhooks:
 * todo es idempotente. El pago siempre se lee de la API de MP; nunca se toma
 * el estado de lo que viene en la URL de retorno.
 *
 *   approved               → Pago acreditado, reserva a `pagada` (sin
 *                            confirmación manual del mayorista).
 *   pending / in_process   → Pago pendiente (efectivo, revisión): reserva a
 *                            `pago_informado`, que la cancelación automática
 *                            no toca. Se resuelve cuando MP avise.
 *   rejected / cancelled   → si estaba pendiente, vuelve a `pendiente_pago`;
 *                            si se rechazó en el acto, solo queda el intento.
 *
 * El historial lo firma el Sistema (usuario_id = null): el cambio lo decide
 * la pasarela, no una persona.
 */

const PENDIENTES = ['pending', 'in_process', 'authorized'];
const RECHAZADOS = ['rejected', 'cancelled'];

const estadoIntento = (status) => {
  if (status === 'approved') return 'aprobado';
  if (PENDIENTES.includes(status)) return 'pendiente';
  if (RECHAZADOS.includes(status)) return 'rechazado';
  return null;
};

const datosPasarela = (pagoMP, intento) => ({
  proveedor: 'mercadopago',
  payment_id: String(pagoMP.id),
  preference_id: intento.preference_id,
  status: pagoMP.status,
  status_detail: pagoMP.status_detail ?? null,
  medio: pagoMP.payment_method_id ?? pagoMP.payment_type_id ?? null,
  monto_ars: pagoMP.transaction_amount ?? null,
  tipo_cambio: intento.tipo_cambio,
});

const auditar = (reserva, accion, detalle, resultado = 'exitoso', usuario_id = null) =>
  registrarAuditoria({
    accion,
    usuario_id,
    mayorista_id: reserva.mayorista_id ?? null,
    agencia_id: reserva.agencia_id ?? null,
    entidad_afectada: 'Reserva',
    entidad_id: reserva._id,
    detalle: { pasarela: 'mercadopago', ...detalle },
    resultado,
  });

const aplicarPagoMercadoPago = async (pagoMP) => {
  const reservaId = pagoMP?.external_reference;
  if (!pagoMP?.id || !mongoose.isValidObjectId(reservaId)) {
    return { resultado: 'ignorado', motivo: 'El pago no corresponde a una reserva' };
  }

  const paymentId = String(pagoMP.id);
  const { status } = pagoMP;
  const statusDetail = pagoMP.status_detail ?? null;
  const nuevoEstadoIntento = estadoIntento(status);
  const base = { reserva_id: reservaId, payment_id: paymentId, status, status_detail: statusDetail };

  if (!nuevoEstadoIntento) {
    // refunded, charged_back, in_mediation: fuera del alcance de la simulación.
    return { ...base, resultado: 'ignorado', motivo: `Estado de MP no contemplado: ${status}` };
  }

  const reserva = await Reserva.findById(reservaId);
  if (!reserva) return { ...base, resultado: 'ignorado', motivo: 'Reserva inexistente' };

  const intento =
    (await IntentoPago.findOne({ reserva_id: reservaId, payment_id: paymentId })) ||
    (await IntentoPago.findOne({ reserva_id: reservaId }).sort({ created_at: -1 }));
  if (!intento) {
    return { ...base, resultado: 'ignorado', motivo: 'No hay un checkout generado para esta reserva' };
  }

  // El monto cobrado tiene que ser el del checkout que generó el servidor.
  const montoOk =
    pagoMP.currency_id === 'ARS' &&
    Math.abs(Number(pagoMP.transaction_amount) - intento.monto_ars) <= 0.01;
  if (!montoOk) {
    auditar(reserva, 'PAGO_CONFIRMADO', {
      payment_id: paymentId,
      motivo: 'El monto cobrado no coincide con el del checkout',
      monto_esperado_ars: intento.monto_ars,
      monto_cobrado: pagoMP.transaction_amount,
      moneda: pagoMP.currency_id,
    }, 'fallido');
    return { ...base, resultado: 'monto_invalido' };
  }

  const session = await mongoose.startSession();
  try {
    let resultado = 'sin_cambios';
    let auditoria = null;

    await session.withTransaction(async () => {
      resultado = 'sin_cambios';
      auditoria = null;

      const existente = await Pago.findOne({ 'pasarela.payment_id': paymentId }).session(session);
      const pasarela = datosPasarela(pagoMP, intento);

      intento.estado = nuevoEstadoIntento;
      intento.payment_id = paymentId;
      intento.status_detail = statusDetail;
      await intento.save({ session });

      if (existente && existente.pasarela.status === status) return; // ya procesado

      // ---------- Aprobado ----------
      if (status === 'approved') {
        // pago_informado puede venir de este mismo pago (estaba pendiente) o
        // de un pago manual que la agencia informó mientras tanto. En el
        // segundo caso el manual queda reemplazado: la plata entró por MP.
        const actualizada = await Reserva.findOneAndUpdate(
          { _id: reserva._id, estado: { $in: ['pendiente_pago', 'pago_informado'] } },
          { $set: { estado: 'pagada' } },
          { session, new: false }
        );

        if (!actualizada) {
          // Reserva cancelada o ya pagada: el cobro no se puede aplicar y en
          // la realidad habría que devolverlo.
          resultado = 'no_aplicable';
          auditoria = ['PAGO_CONFIRMADO', {
            payment_id: paymentId,
            estado_reserva: reserva.estado,
            motivo: 'Pago aprobado sobre una reserva que ya no admite pagos: requiere devolución',
          }, 'fallido'];
          return;
        }

        await Pago.updateMany(
          { reserva_id: reserva._id, origen: 'manual', rechazado: false },
          { $set: { rechazado: true, motivo_rechazo: 'Reemplazado por el pago acreditado en Mercado Pago', rechazado_at: new Date() } },
          { session }
        );

        if (existente) {
          existente.pasarela = pasarela;
          existente.fecha_pago = new Date(pagoMP.date_approved || Date.now());
          await existente.save({ session });
        } else {
          await Pago.create([{
            reserva_id: reserva._id,
            registrado_por: intento.iniciado_por,
            monto: intento.monto_usd,
            metodo: 'mercadopago',
            comprobante: paymentId,
            fecha_pago: new Date(pagoMP.date_approved || pagoMP.date_created || Date.now()),
            origen: 'pasarela',
            pasarela,
          }], { session });
        }

        await registrarCambioEstado(
          reserva._id, null, actualizada.estado, 'pagada',
          `Pago acreditado por Mercado Pago. Operación N° ${paymentId}`, session
        );
        resultado = 'acreditado';
        auditoria = ['PAGO_CONFIRMADO', {
          payment_id: paymentId,
          monto_ars: pagoMP.transaction_amount,
          tipo_cambio: intento.tipo_cambio,
        }];
        return;
      }

      // ---------- Pendiente de acreditación ----------
      if (PENDIENTES.includes(status)) {
        if (existente) {
          existente.pasarela = pasarela;
          await existente.save({ session });
          return;
        }

        const actualizada = await Reserva.findOneAndUpdate(
          { _id: reserva._id, estado: 'pendiente_pago' },
          { $set: { estado: 'pago_informado' } },
          { session }
        );
        if (!actualizada) return;

        await Pago.create([{
          reserva_id: reserva._id,
          registrado_por: intento.iniciado_por,
          monto: intento.monto_usd,
          metodo: 'mercadopago',
          comprobante: paymentId,
          notas: 'Pendiente de acreditación en Mercado Pago',
          fecha_pago: new Date(pagoMP.date_created || Date.now()),
          origen: 'pasarela',
          pasarela,
        }], { session });

        await registrarCambioEstado(
          reserva._id, null, 'pendiente_pago', 'pago_informado',
          `Pago pendiente de acreditación en Mercado Pago. Operación N° ${paymentId}`, session
        );
        resultado = 'pendiente';
        auditoria = ['PAGO_INFORMADO', { payment_id: paymentId, monto_ars: pagoMP.transaction_amount }];
        return;
      }

      // ---------- Rechazado ----------
      const motivo = `Mercado Pago no acreditó el pago (${statusDetail || status})`;
      if (existente) {
        existente.pasarela = pasarela;
        existente.rechazado = true;
        existente.motivo_rechazo = motivo;
        existente.rechazado_at = new Date();
        await existente.save({ session });

        const actualizada = await Reserva.findOneAndUpdate(
          { _id: reserva._id, estado: 'pago_informado' },
          { $set: { estado: 'pendiente_pago' } },
          { session }
        );
        if (actualizada) {
          // Mismo formato que el rechazo manual: lo lee extraerUltimoRechazo.
          await registrarCambioEstado(
            reserva._id, null, 'pago_informado', 'pendiente_pago',
            `Pago rechazado. Motivo: ${motivo}`, session
          );
        }
      }
      resultado = 'rechazado';
      auditoria = ['PAGO_RECHAZADO', { payment_id: paymentId, motivo }, 'exitoso', null];
    });

    if (auditoria) auditar(reserva, ...auditoria);
    return { ...base, resultado };
  } catch (error) {
    // Otro proceso (webhook + retorno simultáneos) ya registró este pago.
    if (error.code === 11000) return { ...base, resultado: 'sin_cambios' };
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = { aplicarPagoMercadoPago, estadoIntento };
