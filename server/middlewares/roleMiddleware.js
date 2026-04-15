/**
 * Middleware de autorización por rol.
 * Recibe uno o más roles permitidos y verifica que el usuario
 * autenticado tenga alguno de ellos.
 *
 * Uso: role('admin', 'mayorista') o role(['admin', 'mayorista'])
 */
const role = (...rolesPermitidos) => {
  // Soportar tanto role('admin') como role(['admin', 'mayorista'])
  const roles = rolesPermitidos.flat();

  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: 'Acceso denegado. Usuario no autenticado.',
      });
    }

    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para acceder a este recurso.',
      });
    }

    next();
  };
};

module.exports = role;
