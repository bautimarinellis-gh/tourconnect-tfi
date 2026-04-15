const Mayorista = require('../models/Mayorista');

/**
 * @desc    Obtener mi perfil de mayorista
 * @route   GET /api/v1/mayoristas/perfil
 * @access  Private/Mayorista
 */
exports.getPerfil = async (req, res, next) => {
  try {
    // req.usuario.userId viene del verifyToken (auth)
    const mayorista = await Mayorista.findOne({ usuario_id: req.usuario.userId })
      .populate('usuario_id', 'email nombre')
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
    const { nombre, razon_social, telefono } = req.body;

    // Actualizamos basándonos en el usuario autenticado
    const mayorista = await Mayorista.findOneAndUpdate(
      { usuario_id: req.usuario.userId },
      { nombre, razon_social, telefono },
      { new: true, runValidators: true }
    ).populate('usuario_id', 'email nombre');

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
