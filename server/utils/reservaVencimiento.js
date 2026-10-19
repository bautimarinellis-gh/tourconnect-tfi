const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const { registrarCambioEstado } = require('./historialEstadoReserva');
const { registrarAuditoria } = require('./auditService');
const { hoyDateString } = require('./dateHelpers');

const MOTIVO_AUTOMATICO = 'Cancelada automáticamente: la fecha del viaje pasó sin pago informado.';
const MOTIVO_CIERRE_AUTOMATICO = 'Cerrada automáticamente: el viaje finalizó con el pago confirmado.';

/**
 * Cancela las reservas en `pendiente_pago` cuyo viaje ya empezó.
 *
 * Sin esto quedaban pendientes para siempre, ensuciando los listados y los
 * reportes. Se cancelan (no se crea un estado nuevo): así liberan el cupo
 * igual que una cancelación manual (ver cupoValidator).
 *
 * No se tocan las reservas en `pago_informado`: hay un pago esperando que el
 * mayorista lo revise, y esa decisión es suya.
 *
 * El cambio queda en el historial con usuario_id = null ("Sistema") y en
 * auditoría como RESERVA_CANCELADA con detalle `automatica: true`.
 */
const cancelarReservasVencidas = async () => {
  try {
    // Las fechas de viaje se guardan como medianoche UTC del día elegido.
    const inicioHoy = new Date(hoyDateString());

    const cotizacionesPasadas = await Cotizacion.find({
      estado: 'reserva_generada',
      fecha_inicio: { $lt: inicioHoy },
    }).distinct('_id');

    if (cotizacionesPasadas.length === 0) return 0;

    const reservas = await Reserva.find({
      cotizacion_id: { $in: cotizacionesPasadas },
      estado: 'pendiente_pago',
    }).populate('cotizacion_id', 'mayorista_id agencia_id');

    let canceladas = 0;
    for (const reserva of reservas) {
      const session = await mongoose.startSession();
      try {
        let cancelada = false;
        await session.withTransaction(async () => {
          // Filtro por estado: si la agencia informó un pago justo ahora, no se pisa.
          const actualizada = await Reserva.findOneAndUpdate(
            { _id: reserva._id, estado: 'pendiente_pago' },
            { $set: { estado: 'cancelada', motivo_cancelacion: MOTIVO_AUTOMATICO } },
            { session, new: true }
          );
          if (!actualizada) return;
          await registrarCambioEstado(reserva._id, null, 'pendiente_pago', 'cancelada', MOTIVO_AUTOMATICO, session);
          cancelada = true;
        });

        if (cancelada) {
          canceladas += 1;
          registrarAuditoria({
            accion: 'RESERVA_CANCELADA',
            usuario_id: null,
            mayorista_id: reserva.cotizacion_id?.mayorista_id ?? null,
            agencia_id: reserva.cotizacion_id?.agencia_id ?? null,
            entidad_afectada: 'Reserva',
            entidad_id: reserva._id,
            detalle: { automatica: true, motivo_cancelacion: MOTIVO_AUTOMATICO },
          });
        }
      } catch (error) {
        console.error(`[Reservas] No se pudo cancelar la reserva ${reserva._id}:`, error.message);
      } finally {
        await session.endSession();
      }
    }

    if (canceladas > 0) {
      console.log(`[Reservas] Canceladas automáticamente: ${canceladas} (viaje pasado sin pago).`);
    }
    return canceladas;
  } catch (error) {
    console.error('[Reservas] Error al cancelar reservas vencidas:', error);
    return 0;
  }
};

/**
 * Cierra las reservas `pagada` cuyo viaje ya terminó (fecha de fin anterior
 * a hoy). Antes quedaban como "pagadas" hasta que alguien las cerrara a mano,
 * mezcladas con las operaciones en curso.
 *
 * Igual que la cancelación automática: transacción por reserva, filtro por
 * estado para no pisar un cambio simultáneo, historial con usuario_id = null
 * ("Sistema") y auditoría RESERVA_CERRADA con `automatica: true`.
 */
const cerrarReservasFinalizadas = async () => {
  try {
    const inicioHoy = new Date(hoyDateString());

    const cotizacionesTerminadas = await Cotizacion.find({
      estado: 'reserva_generada',
      fecha_fin: { $lt: inicioHoy },
    }).distinct('_id');

    if (cotizacionesTerminadas.length === 0) return 0;

    const reservas = await Reserva.find({
      cotizacion_id: { $in: cotizacionesTerminadas },
      estado: 'pagada',
    }).populate('cotizacion_id', 'mayorista_id agencia_id');

    let cerradas = 0;
    for (const reserva of reservas) {
      const session = await mongoose.startSession();
      try {
        let cerrada = false;
        await session.withTransaction(async () => {
          const actualizada = await Reserva.findOneAndUpdate(
            { _id: reserva._id, estado: 'pagada' },
            { $set: { estado: 'cerrada' } },
            { session, new: true }
          );
          if (!actualizada) return;
          await registrarCambioEstado(reserva._id, null, 'pagada', 'cerrada', MOTIVO_CIERRE_AUTOMATICO, session);
          cerrada = true;
        });

        if (cerrada) {
          cerradas += 1;
          registrarAuditoria({
            accion: 'RESERVA_CERRADA',
            usuario_id: null,
            mayorista_id: reserva.cotizacion_id?.mayorista_id ?? null,
            agencia_id: reserva.cotizacion_id?.agencia_id ?? null,
            entidad_afectada: 'Reserva',
            entidad_id: reserva._id,
            detalle: { automatica: true, motivo: MOTIVO_CIERRE_AUTOMATICO },
          });
        }
      } catch (error) {
        console.error(`[Reservas] No se pudo cerrar la reserva ${reserva._id}:`, error.message);
      } finally {
        await session.endSession();
      }
    }

    if (cerradas > 0) {
      console.log(`[Reservas] Cerradas automáticamente: ${cerradas} (viaje finalizado y pagado).`);
    }
    return cerradas;
  } catch (error) {
    console.error('[Reservas] Error al cerrar reservas finalizadas:', error);
    return 0;
  }
};

module.exports = {
  cancelarReservasVencidas,
  cerrarReservasFinalizadas,
  MOTIVO_AUTOMATICO,
  MOTIVO_CIERRE_AUTOMATICO,
};
