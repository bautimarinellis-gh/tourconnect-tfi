/**
 * Middleware de tenant (multi-tenancy).
 * Garantiza que el recurso solicitado pertenezca al mayorista
 * asociado al usuario autenticado.
 *
 * - Si el usuario es admin, pasa sin restricción.
 * - Si el usuario es mayorista, inyecta su propio ID como
 *   mayorista_id en req.
 * - Si el usuario es agencia, inyecta el mayorista_id al
 *   que pertenece la agencia.
 *
 * De este modo, todos los queries posteriores pueden filtrar
 * por req.mayorista_id de forma transparente.
 */
const tenant = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      success: false,
      message: 'Acceso denegado. Usuario no autenticado.',
    });
  }

  const { rol, id, mayorista_id } = req.usuario;

  // Admin tiene acceso global
  if (rol === 'admin') {
    return next();
  }

  // El mayorista usa su mayorista_id (referencia al documento Mayorista)
  if (rol === 'mayorista') {
    if (!mayorista_id) {
      return res.status(400).json({
        success: false,
        message: 'El mayorista no tiene un perfil asociado.',
      });
    }
    req.mayorista_id = mayorista_id;
    return next();
  }

  // La agencia usa el mayorista_id que viene en su token
  if (rol === 'agencia') {
    if (!mayorista_id) {
      return res.status(400).json({
        success: false,
        message: 'La agencia no tiene un mayorista asociado.',
      });
    }
    req.mayorista_id = mayorista_id;
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Rol no reconocido.',
  });
};

/**
 * Factory middleware para validar que un recurso específico pertenece al tenant.
 * Requiere que req.mayorista_id esté seteado (generalmente por el middleware tenant).
 */
const checkOwnership = (Model, tenantField = 'mayorista_id') => {
  return async (req, res, next) => {
    try {
      // Si es admin, dejamos pasar (u otra lógica según tu negocio)
      if (req.usuario && req.usuario.rol === 'admin') {
        return next();
      }

      const resourceId = req.params.id;
      if (!resourceId) {
        return res.status(400).json({ success: false, message: 'ID de recurso no proporcionado' });
      }

      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({ success: false, message: 'Recurso no encontrado' });
      }

      // Validar pertenencia
      if (resource[tenantField] && resource[tenantField].toString() !== req.mayorista_id.toString()) {
        return res.status(403).json({ success: false, message: 'No tienes permisos sobre este recurso' });
      }

      next();
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(404).json({ success: false, message: 'Recurso no encontrado' });
      }
      next(error);
    }
  };
};

module.exports = {
  tenant,
  checkOwnership
};
