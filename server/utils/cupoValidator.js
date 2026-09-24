const Cotizacion = require('../models/Cotizacion');
const Producto = require('../models/Producto');
const Reserva = require('../models/Reserva');
const { estaVigente } = require('./vigenciaCotizacion');

/**
 * Pasajeros que ya ocupan cupo entre las cotizaciones solapadas.
 *
 * Ocupan lugar:
 *  - las aprobadas todavía vigentes (la agencia puede confirmarlas en
 *    cualquier momento dentro de su plazo);
 *  - las que generaron una reserva, salvo que esa reserva se haya cancelado.
 *
 * La cotización de una reserva cancelada sigue en `reserva_generada` (su
 * historia no cambia), así que no alcanza con mirar su estado: la reserva es
 * la única fuente de verdad sobre si el lugar sigue tomado.
 *
 * @param {Array} solapadas cotizaciones en estado aprobada o reserva_generada
 * @param {Set<string>} idsConReservaCancelada ids de cotización cuya reserva se canceló
 * @param {Date} [ahora]
 */
function contarPasajerosComprometidos(solapadas, idsConReservaCancelada, ahora = new Date()) {
  return solapadas.reduce((total, c) => {
    if (c.estado === 'aprobada' && !estaVigente(c, ahora)) return total;
    if (c.estado === 'reserva_generada' && idsConReservaCancelada.has(String(c._id))) return total;
    return total + c.pasajeros;
  }, 0);
}

/**
 * Verifica que aprobar `cotizacion` no exceda el cupo_maximo del producto.
 * Solo aplica a productos tipo 'actividad' (hoteles/paquetes no tienen cupo).
 */
async function verificarCupoDisponible(cotizacion, { session } = {}) {
  const producto = await Producto.findById(cotizacion.producto_id).session(session || null);
  if (!producto || producto.tipo !== 'actividad' || !producto.cupo_maximo) {
    return { ok: true };
  }

  // Rangos inclusivos: una actividad se cotiza para un solo día
  // (fecha_inicio = fecha_fin), y dos actividades el mismo día comparten cupo.
  const solapadas = await Cotizacion.find({
    producto_id: cotizacion.producto_id,
    estado: { $in: ['aprobada', 'reserva_generada'] },
    _id: { $ne: cotizacion._id },
    fecha_inicio: { $lte: cotizacion.fecha_fin },
    fecha_fin: { $gte: cotizacion.fecha_inicio },
  }).session(session || null);

  const idsReservadas = solapadas
    .filter((c) => c.estado === 'reserva_generada')
    .map((c) => c._id);

  const idsConReservaCancelada = new Set(
    idsReservadas.length === 0
      ? []
      : (await Reserva.find({ cotizacion_id: { $in: idsReservadas }, estado: 'cancelada' })
        .session(session || null)
        .distinct('cotizacion_id')).map(String)
  );

  const pasajerosComprometidos = contarPasajerosComprometidos(solapadas, idsConReservaCancelada);
  const disponible = producto.cupo_maximo - pasajerosComprometidos;

  if (cotizacion.pasajeros > disponible) {
    return {
      ok: false,
      message: `No hay cupo suficiente para esas fechas: se solicitan ${cotizacion.pasajeros} pasajeros y quedan ${Math.max(disponible, 0)} de ${producto.cupo_maximo} disponibles.`,
    };
  }

  return { ok: true };
}

module.exports = { verificarCupoDisponible, contarPasajerosComprometidos };
