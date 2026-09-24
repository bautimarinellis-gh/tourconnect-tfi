const { registrarAuditoria } = require('../utils/auditService');

/**
 * Rechaza requests con claves que MongoDB interpretaría como operadores.
 *
 * Varios controllers arman filtros con valores del body o de la query
 * (`findOne({ invite_token })`, `query.estado = estado`). Si el cliente manda
 * un objeto en lugar de un texto — `{"invite_token": {"$ne": null}}` o
 * `?estado[$ne]=x` — mongoose lo castea como operador y la búsqueda deja de
 * ser por igualdad: con el token de invitación eso alcanza para tomar una
 * cuenta ajena.
 *
 * No se usa `mongoose.set('sanitizeFilter', true)` porque envuelve también
 * los `$in`/`$gte` que el propio código escribe a propósito.
 *
 * Se rechaza con 400 en vez de limpiar en silencio: ningún cliente legítimo
 * manda claves con `$` o `.`, así que si llega una es un intento y queda
 * auditado.
 */

/** Primera clave peligrosa encontrada (con su ruta), o null. */
const buscarClaveProhibida = (valor, ruta = '') => {
  if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i += 1) {
      const encontrada = buscarClaveProhibida(valor[i], `${ruta}[${i}]`);
      if (encontrada) return encontrada;
    }
    return null;
  }

  if (valor === null || typeof valor !== 'object') return null;

  for (const clave of Object.keys(valor)) {
    const rutaClave = ruta ? `${ruta}.${clave}` : clave;
    if (clave.startsWith('$') || clave.includes('.')) return rutaClave;
    const encontrada = buscarClaveProhibida(valor[clave], rutaClave);
    if (encontrada) return encontrada;
  }
  return null;
};

const sanitizeInput = (req, res, next) => {
  for (const origen of ['body', 'query', 'params']) {
    const clave = buscarClaveProhibida(req[origen]);
    if (!clave) continue;

    registrarAuditoria({
      req,
      accion: 'ACCESO_DENEGADO',
      resultado: 'fallido',
      detalle: {
        motivo: 'operador_no_permitido',
        origen,
        clave,
        metodo: req.method,
        ruta: req.originalUrl,
      },
    });

    return res.status(400).json({
      success: false,
      message: 'La solicitud contiene campos no permitidos.',
    });
  }

  next();
};

module.exports = { sanitizeInput, buscarClaveProhibida };
