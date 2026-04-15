const Cotizacion = require('../models/Cotizacion');
const AgenciaProducto = require('../models/AgenciaProducto');
const Producto = require('../models/Producto');
const { calcularPrecioTotal } = require('../utils/precioCalculator');

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
      .populate('agencia_id', 'nombre username email') // Adaptado para mostrar algo util si 'nombre' no existe
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
    const { producto_id, pasajeros, fecha_inicio, fecha_fin, notas } = req.body;

    // Validar datos básicos
    if (!producto_id || !pasajeros || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    if (pasajeros < 1) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad de pasajeros debe ser al menos 1'
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
      notas,
      precio_unitario_snapshot: precio_base,
      markup_snapshot: markup_porcentaje,
      precio_total,
      estado: 'pendiente'
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
      .populate('agencia_id')
      .populate('producto_id')
      .populate('mayorista_id', 'nombre_comercial email');

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

    cotizacion.estado = estado;
    if (estado === 'rechazada') {
      cotizacion.motivo_rechazo = motivo_rechazo;
    }
    await cotizacion.save();

    res.status(200).json({
      success: true,
      data: cotizacion,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Confirmar una cotización
// @route   PUT /api/v1/cotizaciones/:id/confirmar
// @access  Private (Solo Mayorista)
exports.confirmarCotizacion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mayorista_id } = req.usuario;

    const cotizacion = await Cotizacion.findById(id);

    if (!cotizacion) {
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada'
      });
    }

    if (cotizacion.mayorista_id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar esta cotización'
      });
    }

    if (cotizacion.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede confirmar una cotización en estado pendiente'
      });
    }

    cotizacion.estado = 'aprobada';
    await cotizacion.save();

    res.status(200).json({
      success: true,
      data: cotizacion
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Rechazar una cotización
// @route   PUT /api/v1/cotizaciones/:id/rechazar
// @access  Private (Solo Mayorista)
exports.rechazarCotizacion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mayorista_id } = req.usuario;
    const { motivo_rechazo } = req.body;

    if (!motivo_rechazo) {
      return res.status(400).json({
        success: false,
        message: 'El motivo de rechazo es obligatorio'
      });
    }

    const cotizacion = await Cotizacion.findById(id);

    if (!cotizacion) {
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada'
      });
    }

    if (cotizacion.mayorista_id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar esta cotización'
      });
    }

    if (cotizacion.estado !== 'pendiente') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede rechazar una cotización en estado pendiente'
      });
    }

    cotizacion.estado = 'rechazada';
    cotizacion.motivo_rechazo = motivo_rechazo;
    await cotizacion.save();

    res.status(200).json({
      success: true,
      data: cotizacion
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

    cotizacion.estado = 'cancelada';
    if (motivo_cancelacion) {
      cotizacion.motivo_cancelacion = motivo_cancelacion;
    }
    await cotizacion.save();

    res.status(200).json({
      success: true,
      data: cotizacion,
    });
  } catch (error) {
    next(error);
  }
};
