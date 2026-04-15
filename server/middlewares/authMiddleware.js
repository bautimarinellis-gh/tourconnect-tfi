const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('../controllers/authController');

/**
 * Middleware de autenticación.
 * Verifica el token JWT desde la cookie HttpOnly 'token'.
 * Rechaza tokens que hayan sido invalidados (logout).
 * Agrega req.usuario con los datos decodificados del token.
 */
const auth = (req, res, next) => {
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

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado.',
    });
  }
};

module.exports = auth;
