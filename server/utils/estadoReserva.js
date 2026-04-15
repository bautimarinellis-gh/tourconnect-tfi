const EstadoReserva = require('../models/EstadoReserva');

/**
 * Registra un cambio de estado en el historial inmutable de una reserva.
 *
 * @param {ObjectId} reserva_id   - ID de la reserva
 * @param {ObjectId} usuario_id   - ID del usuario que realiza el cambio
 * @param {string|null} estado_anterior - Estado previo (null en la creación)
 * @param {string} estado_nuevo   - Nuevo estado de la reserva
 * @param {string|null} comentario - Comentario opcional
 * @param {ClientSession} session - Sesión de Mongoose para transacciones
 * @returns {Promise<Document>} El registro de EstadoReserva creado
 */
const registrarCambioEstado = async (
  reserva_id,
  usuario_id,
  estado_anterior,
  estado_nuevo,
  comentario,
  session
) => {
  const [registro] = await EstadoReserva.create(
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
