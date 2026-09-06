const AuditLog = require('../models/AuditLog');

const CATEGORIA_POR_ACCION = {
  LOGIN_EXITOSO: 'seguridad',
  LOGIN_FALLIDO: 'seguridad',
  LOGOUT: 'seguridad',
  CAMBIO_PASSWORD: 'seguridad',
  RESET_PASSWORD: 'seguridad',
  USUARIO_CREADO: 'seguridad',
  USUARIO_DESACTIVADO: 'seguridad',
  ACCESO_DENEGADO: 'seguridad',
  RESERVA_CREADA: 'negocio',
  PAGO_INFORMADO: 'negocio',
  PAGO_CONFIRMADO: 'negocio',
  PAGO_RECHAZADO: 'negocio',
  RESERVA_CERRADA: 'negocio',
  RESERVA_CANCELADA: 'negocio',
};

/**
 * Extrae la IP real del cliente, considerando proxies.
 * En producción detrás de Nginx, el IP real llega en X-Forwarded-For.
 */
const getIp = (req) => {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req?.ip ?? null;
};

/**
 * Escribe un registro de auditoría en MongoDB.
 *
 * Llamar sin await → fire-and-forget (errores se loguean, no se propagan).
 * Llamar con await → sincrónico; usar solo cuando perder el log tiene costo
 * de seguridad (ej: LOGIN_FALLIDO para detección de brute-force).
 *
 * @param {object} params
 * @param {import('express').Request} [params.req]  - Request de Express (extrae ip, user-agent, usuario)
 * @param {string}  params.accion                   - Valor del enum ACCIONES
 * @param {string}  [params.entidad_afectada]        - Nombre del modelo afectado
 * @param {*}       [params.entidad_id]              - ObjectId del documento afectado
 * @param {object}  [params.detalle]                 - Datos extra (before/after, motivos, etc.)
 * @param {'exitoso'|'fallido'} [params.resultado]
 * @param {*}       [params.usuario_id]              - Override del usuario_id (si no viene en req.usuario)
 * @param {*}       [params.mayorista_id]            - Override del mayorista_id
 * @param {*}       [params.agencia_id]              - Override del agencia_id
 */
const registrarAuditoria = async ({
  req,
  accion,
  entidad_afectada = null,
  entidad_id = null,
  detalle = null,
  resultado = 'exitoso',
  usuario_id,
  mayorista_id,
  agencia_id,
}) => {
  try {
    const u = req?.usuario;

    await AuditLog.create({
      usuario_id:   usuario_id   !== undefined ? usuario_id   : (u?.id          ?? null),
      mayorista_id: mayorista_id !== undefined ? mayorista_id : (u?.mayorista_id ?? null),
      agencia_id:   agencia_id   !== undefined ? agencia_id   : (u?.agencia_id   ?? null),
      accion,
      categoria: CATEGORIA_POR_ACCION[accion],
      entidad_afectada,
      entidad_id: entidad_id ?? null,
      detalle,
      resultado,
      ip_address: getIp(req),
      user_agent: req?.headers?.['user-agent'] ?? null,
    });
  } catch (err) {
    console.error('[audit]', accion, err.message);
  }
};

module.exports = { registrarAuditoria };
