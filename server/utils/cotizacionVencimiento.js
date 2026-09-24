const Cotizacion = require('../models/Cotizacion');
const { horasVigencia } = require('./vigenciaCotizacion');
const { hoyDateString } = require('./dateHelpers');

/**
 * Vence las cotizaciones que superaron su plazo (regla completa en
 * utils/vigenciaCotizacion.js):
 *  - pendientes que el mayorista no respondió a tiempo;
 *  - aprobadas que la agencia no convirtió en reserva a tiempo, o cuyo viaje
 *    ya empezó. Vencerlas libera el cupo que retenían.
 */
const checkCotizacionesVencidas = async () => {
  try {
    const fechaCorte = new Date(Date.now() - horasVigencia() * 60 * 60 * 1000);
    // Las fechas de viaje se guardan como medianoche UTC del día elegido.
    const inicioHoy = new Date(hoyDateString());

    const [pendientes, aprobadas] = await Promise.all([
      Cotizacion.updateMany(
        { estado: 'pendiente', created_at: { $lt: fechaCorte } },
        { $set: { estado: 'vencida' } }
      ),
      Cotizacion.updateMany(
        {
          estado: 'aprobada',
          $or: [
            { aprobada_at: { $lt: fechaCorte } },
            // Aprobadas anteriores a `aprobada_at`: el plazo corre desde su
            // última modificación, que fue la aprobación.
            { aprobada_at: null, updated_at: { $lt: fechaCorte } },
            { fecha_inicio: { $lt: inicioHoy } },
          ],
        },
        { $set: { estado: 'vencida' } }
      ),
    ]);

    const total = pendientes.modifiedCount + aprobadas.modifiedCount;
    if (total > 0) {
      console.log(
        `[Cotizaciones] Vencidas: ${pendientes.modifiedCount} pendiente(s), ${aprobadas.modifiedCount} aprobada(s) sin reservar.`
      );
    }
  } catch (error) {
    console.error('[Cotizaciones] Error al verificar cotizaciones vencidas:', error);
  }
};

module.exports = { checkCotizacionesVencidas };
