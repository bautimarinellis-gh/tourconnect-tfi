const Cotizacion = require('../models/Cotizacion');

// Ventana de vigencia de una cotización pendiente antes de vencer automáticamente.
// El frontend (client/src/pages/agencia/Cotizaciones.jsx) tiene su propia
// constante HORAS_VENCIMIENTO con el mismo valor, solo para mostrar la
// cuenta regresiva — no hay endpoint que exponga este valor, así que si
// se cambia acá hay que actualizarlo ahí también.
const HORAS_VENCIMIENTO_COTIZACION = 72;

const checkCotizacionesVencidas = async () => {
  try {
    const fechaCorte = new Date(Date.now() - HORAS_VENCIMIENTO_COTIZACION * 60 * 60 * 1000);

    const result = await Cotizacion.updateMany(
      {
        estado: 'pendiente',
        created_at: { $lt: fechaCorte }
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
  checkCotizacionesVencidas,
  HORAS_VENCIMIENTO_COTIZACION,
};
