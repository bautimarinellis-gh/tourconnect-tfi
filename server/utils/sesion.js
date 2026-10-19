const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const TokenRevocado = require('../models/TokenRevocado');

/**
 * Emisión y revocación de sesiones (JWT en cookie HttpOnly).
 *
 * Una sesión deja de valer por dos caminos:
 *  - logout: ese token puntual se registra en TokenRevocado;
 *  - cambio de contraseña o desactivación: sube `sesion_version` del usuario
 *    y todos sus tokens anteriores quedan inválidos (ver authMiddleware).
 */

const COOKIE = 'token';
const DURACION_MS = 7 * 24 * 60 * 60 * 1000;

const opcionesCookie = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
});

const generarToken = (usuario, contexto) =>
  jwt.sign(
    {
      id: usuario._id,
      email: usuario.email,
      rol: usuario.rol,
      mayorista_id: contexto.mayorista_id || null,
      agencia_id: contexto.agencia_id || null,
      sv: usuario.sesion_version ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/** Emite un token nuevo y lo deja en la cookie de sesión. */
const iniciarSesion = (res, usuario, contexto) => {
  const token = generarToken(usuario, contexto);
  res.cookie(COOKIE, token, { ...opcionesCookie(), maxAge: DURACION_MS });
  return token;
};

const cerrarCookie = (res) => res.clearCookie(COOKIE, opcionesCookie());

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Invalida un token puntual hasta su vencimiento natural. */
const revocarToken = async (token) => {
  const decoded = jwt.decode(token);
  const expira_en = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + DURACION_MS);
  await TokenRevocado.updateOne(
    { token_hash: hashToken(token) },
    { $setOnInsert: { expira_en } },
    { upsert: true }
  );
};

const estaRevocado = async (token) =>
  Boolean(await TokenRevocado.exists({ token_hash: hashToken(token) }));

/** ¿El token se emitió antes del último cambio de contraseña o desactivación? */
const versionVencida = (decoded, usuario) => (decoded.sv ?? 0) !== (usuario.sesion_version ?? 0);

module.exports = {
  COOKIE,
  iniciarSesion,
  cerrarCookie,
  revocarToken,
  estaRevocado,
  versionVencida,
};
