const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');

/**
 * Cuenta operaciones activas (cotizaciones y reservas) según los filtros dados.
 * Usado tanto para verificar si un Mayorista puede desactivarse (todas sus
 * agencias) como si una Agencia individual puede desactivarse.
 *
 * Cotizaciones activas: estado IN ['pendiente', 'aprobada']
 * Reservas activas:     estado = 'pendiente_pago'
 *                    OR (estado = 'pagada' AND fecha_fin >= hoy)
 *
 * @param {object} cotizacionFiltro - filtro adicional para Cotizacion.countDocuments
 * @param {object} reservaMatch     - filtro adicional ($match) tras el lookup de Cotizacion
 */
async function contarOperacionesActivas(cotizacionFiltro, reservaMatch) {
  const ahora = new Date();
  const cotizacionCollection = Cotizacion.collection.name;

  const [cotizacionesActivas, reservasActivasAgg] = await Promise.all([
    Cotizacion.countDocuments({
      ...cotizacionFiltro,
      estado: { $in: ['pendiente', 'aprobada'] },
    }),
    Reserva.aggregate([
      {
        $lookup: {
          from: cotizacionCollection,
          localField: 'cotizacion_id',
          foreignField: '_id',
          as: 'cot',
        },
      },
      { $unwind: '$cot' },
      {
        $match: {
          ...reservaMatch,
          $or: [
            { estado: 'pendiente_pago' },
            { estado: 'pagada', 'cot.fecha_fin': { $gte: ahora } },
          ],
        },
      },
      { $count: 'total' },
    ]),
  ]);

  const reservasActivas = reservasActivasAgg[0]?.total ?? 0;

  return { cotizacionesActivas, reservasActivas };
}

module.exports = { contarOperacionesActivas };
