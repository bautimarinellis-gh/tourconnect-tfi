const Mayorista = require('../models/Mayorista');

/**
 * @desc    Obtener mi perfil de mayorista
 * @route   GET /api/v1/mayoristas/perfil
 * @access  Private/Mayorista
 */
exports.getPerfil = async (req, res, next) => {
  try {
    const mayorista = await Mayorista.findOne({ usuario_id: req.usuario.id })
      .populate('usuario_id', 'email activo')
      .lean();

    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Perfil de mayorista no encontrado' });
    }

    res.json({
      success: true,
      data: mayorista,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Actualizar mi perfil de mayorista
 * @route   PUT /api/v1/mayoristas/perfil
 * @access  Private/Mayorista
 */
exports.updatePerfil = async (req, res, next) => {
  try {
    const { nombre, razon_social, telefono, cuit, plan_suscripcion } = req.body;

    // El plan de suscripción es exclusivo del Administrador (ver adminController.updateMayorista).
    // Se rechaza explícitamente en vez de ignorarlo para que el mayorista no asuma que se aplicó.
    if (plan_suscripcion !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'No tenés permisos para modificar el plan de suscripción. Contactá a un administrador.',
      });
    }

    const updateFields = {};
    if (nombre !== undefined) updateFields.nombre = nombre;
    if (razon_social !== undefined) updateFields.razon_social = razon_social;
    if (telefono !== undefined) updateFields.telefono = telefono;
    if (cuit !== undefined) updateFields.cuit = cuit;

    const mayorista = await Mayorista.findOneAndUpdate(
      { usuario_id: req.usuario.id },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('usuario_id', 'email activo');

    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Perfil de mayorista no encontrado' });
    }

    res.json({
      success: true,
      data: mayorista,
    });
  } catch (error) {
    next(error);
  }
};
