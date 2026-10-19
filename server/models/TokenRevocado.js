const mongoose = require('mongoose');

/**
 * Tokens invalidados por logout antes de su vencimiento.
 *
 * Reemplaza al Set en memoria que había antes: ese se perdía al reiniciar el
 * servidor (el token volvía a ser válido) y crecía sin límite. Acá cada
 * registro se borra solo cuando el token habría vencido igual (índice TTL),
 * así la colección nunca guarda más que las sesiones cerradas vigentes.
 *
 * Se guarda el hash SHA-256 del token, no el token: si alguien lee la base,
 * no obtiene credenciales usables.
 */
const tokenRevocadoSchema = new mongoose.Schema({
  token_hash: {
    type: String,
    required: true,
    unique: true,
  },
  expira_en: {
    type: Date,
    required: true,
  },
});

tokenRevocadoSchema.index({ expira_en: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenRevocado', tokenRevocadoSchema);
