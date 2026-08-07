const Cotizacion = require('../models/Cotizacion');
const Producto = require('../models/Producto');

/**
 * Verifica que aprobar `cotizacion` no exceda el cupo_maximo del producto.
 * Solo aplica a productos tipo 'actividad' (hoteles/paquetes no tienen cupo).
 * Cuenta pasajeros de otras cotizaciones activas (aprobada o reserva_generada)
 * cuyas fechas se solapan con la cotización a aprobar.
 */
async function verificarCupoDisponible(cotizacion, { session } = {}) {
  const producto = await Producto.findById(cotizacion.producto_id).session(session || null);
  if (!producto || producto.tipo !== 'actividad' || !producto.cupo_maximo) {
    return { ok: true };
  }

  const solapadas = await Cotizacion.find({
    producto_id: cotizacion.producto_id,
    estado: { $in: ['aprobada', 'reserva_generada'] },
    _id: { $ne: cotizacion._id },
    fecha_inicio: { $lt: cotizacion.fecha_fin },
    fecha_fin: { $gt: cotizacion.fecha_inicio },
  }).session(session || null);

  const pasajerosComprometidos = solapadas.reduce((sum, c) => sum + c.pasajeros, 0);
  const disponible = producto.cupo_maximo - pasajerosComprometidos;

  if (cotizacion.pasajeros > disponible) {
    return {
      ok: false,
      message: `No hay cupo suficiente para esas fechas: se solicitan ${cotizacion.pasajeros} pasajeros y quedan ${Math.max(disponible, 0)} de ${producto.cupo_maximo} disponibles.`,
    };
  }

  return { ok: true };
}

module.exports = { verificarCupoDisponible };
