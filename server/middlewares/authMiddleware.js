const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('../controllers/authController');
const Usuario = require('../models/Usuario');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
// Requeridos para que mongoose tenga los schemas registrados al popular
// rol_id / permisos_individuales, aunque no se usen por nombre acá.
require('../models/Rol');
require('../models/Permiso');
const { resolverPermisosEfectivos } = require('../utils/permisos');

const ACCOUNT_DISABLED_RESPONSE = {
  success: false,
  message: 'Tu cuenta fue desactivada. Contactá a un administrador.',
  code: 'ACCOUNT_DISABLED',
};

/**
 * Verifica que el usuario y, según su rol, la entidad de negocio asociada
 * (Mayorista o Agencia) sigan activos en base de datos.
 *
 * El JWT dura 7 días y no refleja desactivaciones posteriores al login,
 * así que esto se revalida en cada request en vez de confiar en el token.
 *
 * Devuelve el documento del usuario (con rol y permisos populados) o null si
 * la cuenta no está habilitada. Trae los permisos en este mismo query, en vez
 * de en uno aparte, porque de todas formas hay que ir a la base.
 *
 * @returns {Promise<import('mongoose').Document|null>}
 */
const verificarCuentaActiva = async (decoded) => {
  const usuario = await Usuario.findById(decoded.id)
    .select('activo rol rol_id permisos_individuales')
    .populate({ path: 'rol_id', populate: { path: 'permisos' } })
    .populate('permisos_individuales');

  if (!usuario || !usuario.activo) return null;

  if (decoded.rol === 'mayorista') {
    const mayorista = await Mayorista.findById(decoded.mayorista_id).select('activo').lean();
    if (!mayorista || !mayorista.activo) return null;
  } else if (decoded.rol === 'agencia') {
    const [agencia, mayorista] = await Promise.all([
      Agencia.findById(decoded.agencia_id).select('activo').lean(),
      Mayorista.findById(decoded.mayorista_id).select('activo').lean(),
    ]);
    if (!agencia || !agencia.activo) return null;
    if (!mayorista || !mayorista.activo) return null;
  }

  return usuario;
};

/**
 * Middleware de autenticación.
 * Verifica el token JWT desde la cookie HttpOnly 'token'.
 * Rechaza tokens que hayan sido invalidados (logout).
 * Revalida contra la base de datos que la cuenta (y su mayorista/agencia,
 * según corresponda) siga activa, para no confiar ciegamente en un JWT
 * emitido antes de una desactivación.
 * Agrega req.usuario con los datos decodificados del token.
 */
const auth = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Acceso denegado. Token no proporcionado.',
    });
  }

  // Verificar si el token fue invalidado (logout)
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido. Sesión cerrada.',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado.',
    });
  }

  try {
    const usuario = await verificarCuentaActiva(decoded);
    if (!usuario) {
      return res.status(403).json(ACCOUNT_DISABLED_RESPONSE);
    }

    req.usuario = decoded;
    // Permisos efectivos resueltos contra la base, no leídos del token: un
    // permiso revocado deja de valer en la request siguiente.
    req.permisos = await resolverPermisosEfectivos(usuario);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = auth;
