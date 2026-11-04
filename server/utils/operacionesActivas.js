const mongoose = require('mongoose');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const { lookupCotizacionStages } = require('./reporteHelpers');

/**
 * Cuenta operaciones activas (cotizaciones y reservas) según los filtros dados.
 * Usado tanto para verificar si un Mayorista puede desactivarse (todas sus
 * agencias) como si una Agencia individual puede desactivarse.
 *
 * Cotizaciones activas: estado IN ['pendiente', 'aprobada']
 * Reservas activas:     estado IN ['pendiente_pago', 'pago_informado']
 *                    OR (estado = 'pagada' AND fecha_fin >= hoy)
 *
 * `pago_informado` cuenta: hay un pago en revisión o en acreditación en
 * Mercado Pago, es decir, plata en tránsito que alguien tiene que resolver.
 *
 * @param {object} cotizacionFiltro - filtro adicional para Cotizacion.countDocuments
 * @param {object} reservaMatch     - filtro adicional ($match) tras el lookup de Cotizacion
 */
/**
 * En un aggregate Mongo no castea tipos: un id que llega como string (por
 * ejemplo, el mayorista_id del JWT) no matchea nunca contra un ObjectId y el
 * conteo daba 0 aunque hubiera reservas activas.
 */
const aObjectIds = (filtro) =>
  Object.fromEntries(
    Object.entries(filtro).map(([campo, valor]) => [
      campo,
      typeof valor === 'string' && mongoose.Types.ObjectId.isValid(valor)
        ? new mongoose.Types.ObjectId(valor)
        : valor,
    ])
  );

async function contarOperacionesActivas(cotizacionFiltro, reservaMatch) {
  const ahora = new Date();

  const [cotizacionesActivas, reservasActivasAgg] = await Promise.all([
    Cotizacion.countDocuments({
      ...cotizacionFiltro,
      estado: { $in: ['pendiente', 'aprobada'] },
    }),
    Reserva.aggregate([
      // Filtra por tenant sobre la reserva antes de unir (ver lookupCotizacionStages).
      ...lookupCotizacionStages(aObjectIds(reservaMatch)),
      {
        $match: {
          $or: [
            { estado: { $in: ['pendiente_pago', 'pago_informado'] } },
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
