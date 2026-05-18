const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');

/**
 * Registra un cambio de estado en el historial inmutable de una reserva.
 */
const registrarCambioEstado = async (
  reserva_id,
  usuario_id,
  estado_anterior,
  estado_nuevo,
  comentario,
  session
) => {
  const [registro] = await HistorialEstadoReserva.create(
    [
      {
        reserva_id,
        usuario_id,
        estado_anterior,
        estado_nuevo,
        comentario: comentario || null,
      },
    ],
    { session }
  );

  return registro;
};

module.exports = { registrarCambioEstado };
