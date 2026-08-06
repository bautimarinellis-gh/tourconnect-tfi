const Cotizacion = require('../models/Cotizacion');
const AgenciaProducto = require('../models/AgenciaProducto');
const Producto = require('../models/Producto');
const { calcularPrecioTotal } = require('../utils/precioCalculator');
const { registrarAuditoria } = require('../utils/auditService');
const { verificarCupoDisponible } = require('../utils/cupoValidator');

const MAX_PASAJEROS = 30;

// @desc    Obtener todas las cotizaciones
// @route   GET /api/v1/cotizaciones
// @access  Private (Mayorista o Agencia)
exports.getCotizaciones = async (req, res, next) => {
  try {
    const { rol, mayorista_id, agencia_id } = req.usuario;
    const { estado } = req.query;

    const query = {};
    if (estado) {
      query.estado = estado;
    }

    if (rol === 'mayorista') {
      query.mayorista_id = mayorista_id;
    } else if (rol === 'agencia') {
      query.agencia_id = agencia_id;
    }

    const cotizaciones = await Cotizacion.find(query)
      .populate('agencia_id', 'nombre')
      .populate('producto_id', 'nombre tipo precio_base')
      .sort({ created_at: -1 });

    res.status(200).json({
      success: true,
      data: cotizaciones
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Crear nueva cotización
// @route   POST /api/v1/cotizaciones
// @access  Private (Solo Agencia)
exports.createCotizacion = async (req, res, next) => {
  try {
    const { agencia_id } = req.usuario;
    const { producto_id, pasajeros, fecha_inicio, fecha_fin } = req.body;

    // Validar datos básicos
    if (!producto_id || !pasajeros || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    if (pasajeros < 1 || pasajeros > MAX_PASAJEROS) {
      return res.status(400).json({
        success: false,
        message: `La cantidad de pasajeros debe ser entre 1 y ${MAX_PASAJEROS}`
      });
    }

    // Validar que el producto esté habilitado para esa agencia en AgenciaProducto
    const agenciaProducto = await AgenciaProducto.findOne({
      agencia_id,
      producto_id,
      habilitado: true
    }).populate('producto_id');

    if (!agenciaProducto || !agenciaProducto.producto_id || !agenciaProducto.producto_id.activo) {
      return res.status(400).json({
        success: false,
        message: 'Producto no disponible o no habilitado para esta agencia'
      });
    }

    const producto = agenciaProducto.producto_id;
    const mayorista_id = producto.mayorista_id;
    const precio_base = producto.precio_base;
    const markup_porcentaje = agenciaProducto.markup_porcentaje;

    // Validar que las fechas sean coherentes entre sí
    const fechaInicio = new Date(fecha_inicio);
    const fechaFin    = new Date(fecha_fin);

    if (fechaInicio >= fechaFin) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de inicio debe ser anterior a la fecha de fin.',
      });
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaInicio < hoy) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de inicio no puede ser anterior al día de hoy.',
      });
    }

    const cantidad_noches = Math.round((fechaFin - fechaInicio) / 86400000);

    if (cantidad_noches < 1) {
      return res.status(400).json({
        success: false,
        message: 'La estadía debe ser de al menos 1 noche.',
      });
    }

    // Validar que las fechas estén dentro del rango de disponibilidad del producto
    if (
      fechaInicio < new Date(producto.disponibilidad_desde) ||
      fechaFin    > new Date(producto.disponibilidad_hasta)
    ) {
      const desde = new Date(producto.disponibilidad_desde).toISOString().split('T')[0];
      const hasta = new Date(producto.disponibilidad_hasta).toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `Las fechas deben estar dentro del período de disponibilidad del producto: ${desde} al ${hasta}.`,
      });
    }

    // Convertir Decimal128 a number para el cálculo
    const precio_unitario_num = parseFloat(precio_base.toString());
    const markup_num = parseFloat(markup_porcentaje.toString());

    // Calcular precio total: precio_unitario_con_markup × noches × pasajeros
    const precio_total = calcularPrecioTotal(precio_unitario_num, markup_num, cantidad_noches, pasajeros);

    const cotizacion = await Cotizacion.create({
      agencia_id,
      producto_id,
      mayorista_id,
      pasajeros,
      fecha_inicio,
      fecha_fin,
      precio_total,
      estado: 'pendiente',
    });

    registrarAuditoria({
      req,
      accion: 'COTIZACION_CREADA',
      entidad_afectada: 'Cotizacion',
      entidad_id: cotizacion._id,
      detalle: { producto_id, pasajeros, precio_total, fecha_inicio, fecha_fin },
    });

    res.status(201).json({
      success: true,
      data: cotizacion
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Obtener detalle de una cotización
// @route   GET /api/v1/cotizaciones/:id
// @access  Private (Mayorista o Agencia)
exports.getCotizacionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const cotizacion = await Cotizacion.findById(id)
      .populate('agencia_id', 'nombre razon_social cuit telefono activo')
      .populate('producto_id', 'nombre tipo precio_base descripcion disponibilidad_desde disponibilidad_hasta activo')
      .populate('mayorista_id', 'nombre razon_social');

    if (!cotizacion) {
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada'
      });
    }

    // Validar pertenencia según rol
    if (rol === 'mayorista' && cotizacion.mayorista_id._id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta cotización'
      });
    }

    if (rol === 'agencia' && cotizacion.agencia_id._id.toString() !== agencia_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta cotización'
      });
    }

    res.status(200).json({
      success: true,
      data: cotizacion
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Actualizar estado de una cotización (confirmar o rechazar)
// @route   PATCH /api/v1/cotizaciones/:id/estado
// @access  Private (Solo Mayorista)
exports.actualizarEstadoCotizacion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mayorista_id } = req.usuario;
    const { estado, motivo_rechazo } = req.body;

    if (!['aprobada', 'rechazada'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: "El estado debe ser 'aprobada' o 'rechazada'",
      });
    }

    if (estado === 'rechazada' && !motivo_rechazo) {
      return res.status(400).json({
        success: false,
        message: 'El motivo de rechazo es obligatorio',
      });
    }

    const cotizacion = await Cotizacion.findById(id);

    if (!cotizacion) {
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada',
      });
    }

    if (cotizacion.mayorista_id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar esta cotización',
      });
    }

    if (cotizacion.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede modificar una cotización en estado pendiente',
      });
    }

    if (estado === 'aprobada') {
      const cupo = await verificarCupoDisponible(cotizacion);
      if (!cupo.ok) {
        return res.status(400).json({ success: false, message: cupo.message });
      }
    }

    // Update atómico filtrando por el estado esperado: si otra request ya
    // cambió el estado entre el chequeo de arriba y este punto, no matchea
    // ningún documento y devolvemos 409 en vez de pisar el cambio ajeno.
    const update = { estado };
    if (estado === 'rechazada') update.motivo_rechazo = motivo_rechazo;

    const actualizada = await Cotizacion.findOneAndUpdate(
      { _id: id, estado: 'pendiente' },
      { $set: update },
      { new: true }
    );

    if (!actualizada) {
      return res.status(409).json({
        success: false,
        message: 'La cotización ya no está pendiente (fue modificada por otra acción).',
      });
    }

    registrarAuditoria({
      req,
      accion: estado === 'aprobada' ? 'COTIZACION_APROBADA' : 'COTIZACION_RECHAZADA',
      entidad_afectada: 'Cotizacion',
      entidad_id: actualizada._id,
      detalle: estado === 'rechazada' ? { motivo_rechazo, agencia_id: actualizada.agencia_id } : { agencia_id: actualizada.agencia_id },
    });

    res.status(200).json({
      success: true,
      data: actualizada,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancelar una cotización (por la agencia)
// @route   PATCH /api/v1/cotizaciones/:id/cancelar
// @access  Private (Solo Agencia)
exports.cancelarCotizacion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencia_id } = req.usuario;
    const { motivo_cancelacion } = req.body;

    const motivoTrim =
      typeof motivo_cancelacion === 'string' ? motivo_cancelacion.trim() : '';

    if (motivoTrim.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'El motivo de cancelación no puede superar los 500 caracteres.',
      });
    }

    const cotizacion = await Cotizacion.findById(id);

    if (!cotizacion) {
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada',
      });
    }

    if (cotizacion.agencia_id.toString() !== agencia_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cancelar esta cotización',
      });
    }

    if (cotizacion.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden cancelar cotizaciones en estado pendiente',
      });
    }

    const actualizada = await Cotizacion.findOneAndUpdate(
      { _id: id, estado: 'pendiente' },
      { $set: { estado: 'cancelada', motivo_cancelacion: motivoTrim || null } },
      { new: true }
    );

    if (!actualizada) {
      return res.status(409).json({
        success: false,
        message: 'La cotización ya no está pendiente (fue modificada por otra acción).',
      });
    }

    registrarAuditoria({
      req,
      accion: 'COTIZACION_CANCELADA',
      entidad_afectada: 'Cotizacion',
      entidad_id: actualizada._id,
      detalle: motivoTrim ? { motivo_cancelacion: motivoTrim } : null,
    });

    res.status(200).json({
      success: true,
      data: actualizada,
    });
  } catch (error) {
    next(error);
  }
};
