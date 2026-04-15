const AgenciaProducto = require('../models/AgenciaProducto');
const Agencia = require('../models/Agencia');
const Producto = require('../models/Producto');

/**
 * Helper para validar que la agencia pertenezca al mayorista actual
 */
const validarAgencia = async (agenciaId, mayoristaId) => {
  const agencia = await Agencia.findOne({ _id: agenciaId, mayorista_id: mayoristaId });
  if (!agencia) {
    throw new Error('Agencia no encontrada o no pertenece a este mayorista');
  }
  return agencia;
};

/**
 * @route   GET /api/v1/agencias/:id/productos
 * @desc    Lista los productos habilitados (o mapeados) para esa agencia
 * @access  Private (Mayorista)
 */
exports.getProductosAgencia = async (req, res, next) => {
  try {
    const agenciaId = req.params.id;
    const mayoristaId = req.usuario.mayorista_id;

    // Verificar agencia
    await validarAgencia(agenciaId, mayoristaId);

    const productos = await AgenciaProducto.find({ agencia_id: agenciaId })
      .populate('producto_id', 'nombre tipo precio_base')
      .lean();

    res.status(200).json({
      success: true,
      data: productos,
    });
  } catch (error) {
    if (error.message.includes('No encontrada')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @route   POST /api/v1/agencias/:id/productos
 * @desc    Asocia un producto a una agencia con su respectivo markup
 * @access  Private (Mayorista)
 */
exports.addProductoAgencia = async (req, res, next) => {
  try {
    const agenciaId = req.params.id;
    const mayoristaId = req.usuario.mayorista_id;
    const { producto_id, markup_porcentaje } = req.body;

    // 1. Validar agencia
    await validarAgencia(agenciaId, mayoristaId);

    // 2. Validar que el producto pertenezca al mismo mayorista
    const producto = await Producto.findById(producto_id);
    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    if (producto.mayorista_id.toString() !== mayoristaId.toString()) {
      return res.status(403).json({ success: false, message: 'El producto no pertenece al mayorista' });
    }

    // 3. Crear el mapping (si existe, mongodb lanzará error de duplicado por nuestro índice compuesto)
    const nuevoMapping = await AgenciaProducto.create({
      agencia_id: agenciaId,
      producto_id,
      markup_porcentaje,
      habilitado: true,
    });

    res.status(201).json({
      success: true,
      data: nuevoMapping,
    });
  } catch (error) {
    // Manejar error de índice compuesto (E11000 duplicate key error)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'El producto ya está asociado a esta agencia',
      });
    }
    if (error.message.includes('No encontrada')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @route   PUT /api/v1/agencias/:id/productos
 * @desc    Sincroniza en bloque los productos habilitados para una agencia.
 *          Reemplaza todas las relaciones existentes con la lista enviada.
 * @body    { productos: [{ producto_id, markup_porcentaje }] }
 * @access  Private (Mayorista)
 */
exports.syncProductosAgencia = async (req, res, next) => {
  try {
    const agenciaId = req.params.id;
    const mayoristaId = req.usuario.mayorista_id;
    const { productos = [] } = req.body;

    // 1. Validar que la agencia pertenece al mayorista
    await validarAgencia(agenciaId, mayoristaId);

    // 2. Validar que todos los productos pertenezcan al mayorista
    if (productos.length > 0) {
      const ids = productos.map(p => p.producto_id);
      const productosDB = await Producto.find({
        _id: { $in: ids },
        mayorista_id: mayoristaId,
      }).select('_id').lean();

      if (productosDB.length !== ids.length) {
        return res.status(403).json({
          success: false,
          message: 'Uno o más productos no pertenecen al mayorista',
        });
      }
    }

    // 3. Eliminar todas las relaciones existentes para esta agencia
    await AgenciaProducto.deleteMany({ agencia_id: agenciaId });

    // 4. Crear las nuevas relaciones
    if (productos.length > 0) {
      const nuevasRelaciones = productos.map(p => ({
        agencia_id: agenciaId,
        producto_id: p.producto_id,
        markup_porcentaje: Number(p.markup_porcentaje) || 0,
        habilitado: true,
      }));
      await AgenciaProducto.insertMany(nuevasRelaciones);
    }

    res.status(200).json({
      success: true,
      data: { mensaje: 'Productos sincronizados correctamente', total: productos.length },
    });
  } catch (error) {
    if (error.message.includes('No encontrada') || error.message.includes('no pertenece')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @route   PUT /api/v1/agencias/:id/productos/:productoId
 * @desc    Actualiza markup_porcentaje y/o estado habilitado
 * @access  Private (Mayorista)
 */
exports.updateProductoAgencia = async (req, res, next) => {
  try {
    const agenciaId = req.params.id;
    const productoId = req.params.productoId; // ID del producto en Producto model
    const mayoristaId = req.usuario.mayorista_id;
    const { markup_porcentaje, habilitado } = req.body;

    // Verificar agencia
    await validarAgencia(agenciaId, mayoristaId);

    // Buscar mapping a actualizar (usamos producto_id real para la búsqueda)
    const mapping = await AgenciaProducto.findOne({
      agencia_id: agenciaId,
      producto_id: productoId,
    });

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Relación Agencia-Producto no encontrada',
      });
    }

    if (markup_porcentaje !== undefined) mapping.markup_porcentaje = markup_porcentaje;
    if (habilitado !== undefined) mapping.habilitado = habilitado;

    await mapping.save();

    res.status(200).json({
      success: true,
      data: mapping,
    });
  } catch (error) {
    if (error.message.includes('No encontrada')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @route   DELETE /api/v1/agencias/:id/productos/:productoId
 * @desc    Elimina la relación (hard delete)
 * @access  Private (Mayorista)
 */
exports.deleteProductoAgencia = async (req, res, next) => {
  try {
    const agenciaId = req.params.id;
    const productoId = req.params.productoId; // ID del producto en Producto model
    const mayoristaId = req.usuario.mayorista_id;

    // Verificar agencia
    await validarAgencia(agenciaId, mayoristaId);

    const deleted = await AgenciaProducto.findOneAndDelete({
      agencia_id: agenciaId,
      producto_id: productoId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Relación Agencia-Producto no encontrada',
      });
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    if (error.message.includes('No encontrada')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};
