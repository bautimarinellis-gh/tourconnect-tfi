const Cotizacion = require('../models/Cotizacion');

const checkCotizacionesVencidas = async () => {
  try {
    const hace72Horas = new Date(Date.now() - 72 * 60 * 60 * 1000);
    
    const result = await Cotizacion.updateMany(
      {
        estado: 'pendiente',
        created_at: { $lt: hace72Horas }
      },
      {
        $set: { estado: 'vencida' }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`[Cotizaciones] Se han vencido ${result.modifiedCount} cotizaciones.`);
    }
  } catch (error) {
    console.error('[Cotizaciones] Error al verificar cotizaciones vencidas:', error);
  }
};

module.exports = {
  checkCotizacionesVencidas
};
