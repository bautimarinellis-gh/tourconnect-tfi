const HistorialEstadoPersona = require('../models/HistorialEstadoPersona');

/**
 * Registra una transición de estado (activo/inactivo) de una Agencia o Mayorista.
 * @param {ObjectId} persona_id
 * @param {'Mayorista'|'Agencia'} persona_tipo
 * @param {ObjectId} usuario_id       - quien ejecutó el cambio
 * @param {boolean} estado_anterior
 * @param {boolean} estado_nuevo
 * @param {string|null} motivo
 * @param {string|null} motivo_mensaje
 * @param {import('mongoose').ClientSession} [session]
 */
const registrarCambioEstadoPersona = async (
  persona_id,
  persona_tipo,
  usuario_id,
  estado_anterior,
  estado_nuevo,
  motivo,
  motivo_mensaje,
  session
) => {
  const [registro] = await HistorialEstadoPersona.create(
    [{
      persona_id,
      persona_tipo,
      usuario_id,
      estado_anterior,
      estado_nuevo,
      motivo: motivo || null,
      motivo_mensaje: motivo_mensaje || null,
    }],
    { session }
  );
  return registro;
};

module.exports = { registrarCambioEstadoPersona };
