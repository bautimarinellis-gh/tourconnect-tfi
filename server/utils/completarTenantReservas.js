const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');

/**
 * Completa `mayorista_id` y `agencia_id` en las reservas creadas antes de que
 * esos campos existieran, copiándolos de su cotización.
 *
 * Es idempotente: solo toca las reservas a las que les falta el dato, así que
 * se puede correr en cada arranque del server (como bootstrapSeguridad) y
 * cuando no hay nada pendiente cuesta una sola consulta.
 *
 * Las consultas por tenant filtran primero por estos campos (ver
 * reporteHelpers.lookupCotizacionStages): una reserva sin completar quedaría
 * fuera de listados y reportes, por eso el server lo ejecuta antes de
 * empezar a atender requests.
 *
 * @returns {Promise<number>} cantidad de reservas completadas
 */
const completarTenantReservas = async () => {
  const pendientes = await Reserva.find({
    $or: [{ mayorista_id: null }, { agencia_id: null }],
  })
    .select('_id cotizacion_id')
    .lean();

  if (pendientes.length === 0) return 0;

  const cotizaciones = await Cotizacion.find({
    _id: { $in: pendientes.map((r) => r.cotizacion_id) },
  })
    .select('_id mayorista_id agencia_id')
    .lean();
  const porId = new Map(cotizaciones.map((c) => [String(c._id), c]));

  const operaciones = pendientes
    .map((r) => {
      const cot = porId.get(String(r.cotizacion_id));
      if (!cot) return null;
      return {
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { mayorista_id: cot.mayorista_id, agencia_id: cot.agencia_id } },
        },
      };
    })
    .filter(Boolean);

  if (operaciones.length === 0) return 0;

  const resultado = await Reserva.bulkWrite(operaciones);
  return resultado.modifiedCount;
};

module.exports = { completarTenantReservas };
