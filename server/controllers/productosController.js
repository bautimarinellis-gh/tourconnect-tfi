const Producto = require('../models/Producto');
const AgenciaProducto = require('../models/AgenciaProducto');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const { calcularPrecioFinal } = require('../utils/precioCalculator');

/**
 * Obtener todos los productos (con filtrado y comportamiento por rol)
 */
exports.getProductos = async (req, res, next) => {
  try {
    const { rol, id: usuario_id, mayorista_id, agencia_id } = req.usuario;
    const { tipo, activo } = req.query;

    const query = {};

    // Filtros opcionales transversales
    if (tipo) {
      query.tipo = tipo;
    }

    // Comportamiento según el rol
    if (rol === 'mayorista') {
      // El mayorista solo ve sus productos (mayorista_id = ID del documento Mayorista)
      query.mayorista_id = mayorista_id;
      
      if (activo !== undefined) {
        query.activo = activo === 'true';
      }

      const productos = await Producto.find(query).sort({ created_at: -1 });

      return res.status(200).json({
        success: true,
        data: productos,
      });

    } else if (rol === 'agencia') {
      // Las agencias solo ven productos activos por defecto, a menos que se maneje desde el habilitado
      query.activo = true;

      // Buscar las relaciones AgenciaProducto habilitadas para la agencia
      const relaciones = await AgenciaProducto.find({
        agencia_id: agencia_id,
        habilitado: true,
      }).populate({
        path: 'producto_id',
        match: query,
      });

      // Filtrar aquellos donde el populate devolvió null (por mismatch en match de mongoose)
      const productosDisponibles = relaciones
        .filter(rel => rel.producto_id !== null)
        .map(rel => {
          const productoObj = rel.producto_id.toObject();
          
          // Calcular precio final
          const precio_final = calcularPrecioFinal(productoObj.precio_base, rel.markup_porcentaje);
          
          // NUNCA DEVOLVER precio_base
          delete productoObj.precio_base;
          
          return {
            ...productoObj,
            precio_final,
            markup_aplicado: rel.markup_porcentaje
          };
        });

      return res.status(200).json({
        success: true,
        data: productosDisponibles,
      });
    }

    return res.status(403).json({ success: false, message: 'Rol no autorizado' });
  } catch (error) {
    next(error);
  }
};

/**
 * Fecha de hoy (local del servidor) en formato YYYY-MM-DD, para comparar
 * contra los inputs de fecha que llegan del frontend en ese mismo formato.
 */
const hoyDateString = () => new Date().toLocaleDateString('en-CA');

/** Convierte un valor de fecha (string YYYY-MM-DD o Date) a YYYY-MM-DD. */
const toDateString = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/**
 * Valida el rango de disponibilidad.
 * @param {Object} opts
 * @param {string|Date} opts.desde - fecha de inicio efectiva
 * @param {string|Date} opts.hasta - fecha de fin efectiva
 * @param {boolean} opts.validarDesdeHoy - si debe exigirse desde >= hoy
 * @returns {string|null} mensaje de error o null si es válido
 */
const validarDisponibilidad = ({ desde, hasta, validarDesdeHoy }) => {
  const desdeStr = toDateString(desde);
  const hastaStr = toDateString(hasta);
  if (validarDesdeHoy && desdeStr && desdeStr < hoyDateString()) {
    return 'La fecha de disponibilidad no puede ser anterior a la fecha actual.';
  }
  if (desdeStr && hastaStr && hastaStr < desdeStr) {
    return 'La fecha de disponibilidad final debe ser igual o posterior a la inicial.';
  }
  return null;
};

/**
 * Validar campos específicos según el tipo de producto.
 */
const validateTipoFields = (tipo, body) => {
  const errors = [];
  if (tipo === 'hotel') {
    if (!body.direccion) errors.push('La dirección es obligatoria para hoteles');
    if (!body.estrellas) errors.push('La cantidad de estrellas es obligatoria para hoteles');
  } else if (tipo === 'actividad') {
    if (!body.cupo_maximo) errors.push('El cupo máximo es obligatorio para actividades');
    if (!body.duracion_horas) errors.push('La duración es obligatoria para actividades');
  } else if (tipo === 'paquete') {
    if (!body.itinerario) errors.push('El itinerario es obligatorio para paquetes');
  }
  return errors;
};

/**
 * Crear un nuevo producto (Solo Mayoristas)
 */
exports.createProducto = async (req, res, next) => {
  try {
    const { tipo } = req.body;
    
    // Validar tipo manualmente antes de crear
    if (!['hotel', 'actividad', 'paquete'].includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo de producto inválido' });
    }

    const validationErrors = validateTipoFields(tipo, req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, message: validationErrors.join(', ') });
    }

    // En el alta, la disponibilidad no puede empezar antes de hoy
    const errorFechas = validarDisponibilidad({
      desde: req.body.disponibilidad_desde,
      hasta: req.body.disponibilidad_hasta,
      validarDesdeHoy: true,
    });
    if (errorFechas) {
      return res.status(400).json({ success: false, message: errorFechas });
    }

    // Asegurar que el producto se asocie al mayorista del token
    const productoData = {
      ...req.body,
      mayorista_id: req.usuario.mayorista_id,
    };

    const producto = await Producto.create(productoData);

    res.status(201).json({
      success: true,
      data: producto,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    next(error);
  }
};

/**
 * Obtener un producto por ID
 */
exports.getProductoById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const producto = await Producto.findById(id);

    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    if (rol === 'mayorista') {
      if (producto.mayorista_id.toString() !== mayorista_id?.toString()) {
        return res.status(403).json({ success: false, message: 'Acceso denegado a este producto' });
      }

      return res.status(200).json({
        success: true,
        data: producto,
      });

    } else if (rol === 'agencia') {
      if (!producto.activo) {
        return res.status(404).json({ success: false, message: 'Producto no disponible' });
      }

      const relacion = await AgenciaProducto.findOne({
        agencia_id: agencia_id,
        producto_id: id,
        habilitado: true,
      });

      if (!relacion) {
        return res.status(403).json({ success: false, message: 'Producto no habilitado para su agencia' });
      }

      const productoObj = producto.toObject();
      const precio_final = calcularPrecioFinal(productoObj.precio_base, relacion.markup_porcentaje);
      
      delete productoObj.precio_base;

      return res.status(200).json({
        success: true,
        data: {
          ...productoObj,
          precio_final,
          markup_aplicado: relacion.markup_porcentaje
        },
      });
    }

    return res.status(403).json({ success: false, message: 'Rol no autorizado' });
  } catch (error) {
    // Si el ID es inválido para mongoose
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    next(error);
  }
};

/**
 * Actualizar un producto (Solo Mayorista)
 */
exports.updateProducto = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // El tenantMiddleware garantiza que el producto existe y pertenece al mayorista.
    // Solo debemos prevenir cambios de seguridad:
    const updates = { ...req.body };
    delete updates.mayorista_id; // No puede cambiar de dueño
    delete updates._id;

    const existente = await Producto.findById(id);
    if (!existente) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    // Fechas efectivas: las del payload, o las ya guardadas si no se modifican.
    // "Desde >= hoy" solo se exige si la fecha de inicio realmente cambia,
    // para no bloquear la edición de productos cuya vigencia ya comenzó.
    const desdeNuevo = toDateString(updates.disponibilidad_desde);
    const desdeActual = toDateString(existente.disponibilidad_desde);
    const errorFechas = validarDisponibilidad({
      desde: desdeNuevo ?? desdeActual,
      hasta: updates.disponibilidad_hasta ?? existente.disponibilidad_hasta,
      validarDesdeHoy: desdeNuevo !== null && desdeNuevo !== desdeActual,
    });
    if (errorFechas) {
      return res.status(400).json({ success: false, message: errorFechas });
    }

    const producto = await Producto.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!producto) {
       return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    res.status(200).json({
      success: true,
      data: producto,
    });
  } catch (error) {
     if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    next(error);
  }
};

/**
 * Verificar cuántas agencias tienen vinculado un producto (Solo Mayoristas)
 */
exports.checkProductoAgencias = async (req, res, next) => {
  try {
    const { id } = req.params;
    const count = await AgenciaProducto.countDocuments({ producto_id: id });
    res.status(200).json({ success: true, agencias_count: count });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar un producto (Solo Mayoristas)
 * Hard-delete: elimina el documento y en cascada sus registros AgenciaProducto.
 * Bloqueado si el producto tiene cotizaciones o reservas asociadas.
 */
exports.deleteProducto = async (req, res, next) => {
  try {
    const { id } = req.params;

    const producto = await Producto.findById(id);

    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    const cotizacionIds = await Cotizacion.find({ producto_id: id }).distinct('_id');

    const [cotizaciones, reservas] = await Promise.all([
      cotizacionIds.length,
      Reserva.countDocuments({ cotizacion_id: { $in: cotizacionIds } }),
    ]);

    if (cotizaciones > 0 || reservas > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar el producto porque tiene ${cotizaciones} cotización(es) y ${reservas} reserva(s) asociada(s).`,
        cotizaciones,
        reservas,
      });
    }

    const agencias_afectadas = await AgenciaProducto.countDocuments({ producto_id: id });

    await producto.deleteOne();
    await AgenciaProducto.removeByProducto(id);

    res.status(200).json({
      success: true,
      agencias_afectadas,
      message: 'Producto eliminado correctamente',
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    next(error);
  }
};
