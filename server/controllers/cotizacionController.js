const mongoose = require('mongoose');
const Cotizacion = require('../models/Cotizacion');
const AgenciaProducto = require('../models/AgenciaProducto');
const Producto = require('../models/Producto');
const { calcularPrecioCotizacion } = require('../utils/precioCalculator');
const { verificarCupoDisponible } = require('../utils/cupoValidator');
const { hoyDateString, toDateString, sumarDias } = require('../utils/dateHelpers');
const { estaVigente } = require('../utils/vigenciaCotizacion');
const { leerPaginacion, describirPagina } = require('../utils/paginacion');

// Error de negocio (no de DB) usada para abortar la transacción de aprobación
// sin disparar el retry automático de session.withTransaction (solo reintenta
// errores etiquetados TransientTransactionError).
class AprobacionRechazada extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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

    const paginacion = leerPaginacion(req.query);
    let consulta = Cotizacion.find(query)
      .populate('agencia_id', 'nombre')
      // Sin precio_base: esta respuesta también la recibe la agencia.
      .populate('producto_id', 'nombre tipo')
      .sort({ created_at: -1 });
    if (paginacion) consulta = consulta.skip(paginacion.skip).limit(paginacion.limit);

    const [cotizaciones, total] = await Promise.all([
      consulta,
      paginacion ? Cotizacion.countDocuments(query) : null,
    ]);

    res.status(200).json({
      success: true,
      data: cotizaciones,
      ...(paginacion && { pagination: describirPagina(paginacion, total) }),
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
    const { producto_id, fecha_inicio } = req.body;
    const pasajeros = Number(req.body.pasajeros);

    // Validar datos básicos. fecha_fin se valida después, según el tipo de
    // producto: una actividad se cotiza para un solo día.
    if (!producto_id || !req.body.pasajeros || !fecha_inicio) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    if (!Number.isInteger(pasajeros) || pasajeros < 1 || pasajeros > MAX_PASAJEROS) {
      return res.status(400).json({
        success: false,
        message: `La cantidad de pasajeros debe ser un número entero entre 1 y ${MAX_PASAJEROS}`
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
    const esActividad = producto.tipo === 'actividad';

    // Actividad: un solo día, fecha_fin = fecha_inicio (lo que venga en el
    // body se ignora). Hotel y paquete: rango con fin posterior al inicio.
    const fecha_fin = esActividad ? fecha_inicio : req.body.fecha_fin;
    if (!fecha_fin) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios'
      });
    }

    const fechaInicio = new Date(fecha_inicio);
    const fechaFin    = new Date(fecha_fin);

    if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Las fechas no tienen un formato válido.',
      });
    }

    if (!esActividad && fechaInicio >= fechaFin) {
      return res.status(400).json({
        success: false,
        message: producto.tipo === 'hotel'
          ? 'La estadía debe ser de al menos 1 noche: la fecha de fin tiene que ser posterior a la de inicio.'
          : 'La fecha de inicio debe ser anterior a la fecha de fin.',
      });
    }

    if (toDateString(fecha_inicio) < hoyDateString()) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de inicio no puede ser anterior al día de hoy.',
      });
    }

    // Validar que las fechas estén dentro del rango de disponibilidad del producto.
    // En un hotel la disponibilidad son noches: la última noche que se vende
    // es la de disponibilidad_hasta, así que la salida puede ser el día siguiente.
    const desde = toDateString(producto.disponibilidad_desde);
    const hasta = toDateString(producto.disponibilidad_hasta);
    const limiteFin = producto.tipo === 'hotel' ? sumarDias(hasta, 1) : hasta;
    if (toDateString(fechaInicio) < desde || toDateString(fechaInicio) > hasta || toDateString(fechaFin) > limiteFin) {
      return res.status(400).json({
        success: false,
        message: producto.tipo === 'hotel'
          ? `Las noches deben estar dentro del período de disponibilidad del hotel: ${desde} al ${hasta} (salida hasta el ${limiteFin}).`
          : `Las fechas deben estar dentro del período de disponibilidad del producto: ${desde} al ${hasta}.`,
      });
    }

    // Control de cupo al cotizar: evita que la agencia pida algo que el
    // mayorista no va a poder aprobar. El control definitivo (sin sobreventa
    // ante aprobaciones simultáneas) se repite al aprobar, en una transacción.
    const cupo = await verificarCupoDisponible(
      { producto_id, pasajeros, fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      { producto }
    );
    if (!cupo.ok) {
      return res.status(400).json({ success: false, message: cupo.message });
    }

    const markup_porcentaje = parseFloat(agenciaProducto.markup_porcentaje.toString());

    // La fórmula depende del tipo de producto (ver utils/precioCalculator.js)
    const { precio_unitario, unidades, precio_total } = calcularPrecioCotizacion({
      tipo: producto.tipo,
      precio_base: parseFloat(producto.precio_base.toString()),
      markup_porcentaje,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      pasajeros,
    });

    const cotizacion = await Cotizacion.create({
      agencia_id,
      producto_id,
      mayorista_id,
      pasajeros,
      fecha_inicio,
      fecha_fin,
      precio_total,
      tipo_producto: producto.tipo,
      precio_unitario,
      markup_porcentaje,
      unidades,
      estado: 'pendiente',
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
      // Sin precio_base: esta respuesta también la recibe la agencia.
      .populate('producto_id', 'nombre tipo descripcion disponibilidad_desde disponibilidad_hasta activo')
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

    const motivoRechazoTrim =
      typeof motivo_rechazo === 'string' ? motivo_rechazo.trim() : '';

    if (estado === 'rechazada' && !motivoRechazoTrim) {
      return res.status(400).json({
        success: false,
        message: 'El motivo de rechazo es obligatorio',
      });
    }

    if (motivoRechazoTrim.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'El motivo de rechazo no puede superar los 500 caracteres',
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

    // El cron de vencimiento corre cada hora: entre corrida y corrida una
    // pendiente puede haber superado su plazo sin estar marcada todavía.
    if (!estaVigente(cotizacion)) {
      return res.status(400).json({
        success: false,
        message: 'La cotización venció: superó el plazo para ser respondida.',
      });
    }

    // Revalidar vigencia: la fecha de inicio se valida contra "hoy" al crear
    // la cotización, pero el mayorista puede tardar días en aprobarla (hasta
    // que vence a las 72hs). Si para entonces el viaje ya empezó, no debe
    // poder aprobarse.
    if (estado === 'aprobada') {
      if (toDateString(cotizacion.fecha_inicio) < hoyDateString()) {
        return res.status(400).json({
          success: false,
          message: 'No se puede aprobar: la fecha de inicio del viaje ya pasó.',
        });
      }
    }

    let actualizada;

    if (estado === 'aprobada') {
      // El chequeo de cupo (lectura de otras cotizaciones) y el cambio de
      // estado deben ser una sola operación atómica: si no, dos aprobaciones
      // concurrentes para el mismo producto pueden leer cupo disponible antes
      // de que ninguna haya escrito, y ambas pasar (sobreventa). Se resuelve
      // con una transacción que además toca `cupo_lock_version` del producto:
      // dos transacciones que escriben el mismo documento generan un write
      // conflict real, y la que pierde se reintenta con datos frescos.
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const cotizacionActual = await Cotizacion.findById(id).session(session);
          if (!cotizacionActual || cotizacionActual.estado !== 'pendiente') {
            throw new AprobacionRechazada(409, 'La cotización ya no está pendiente (fue modificada por otra acción).');
          }

          await Producto.findByIdAndUpdate(
            cotizacionActual.producto_id,
            { $inc: { cupo_lock_version: 1 } },
            { session }
          );

          const cupo = await verificarCupoDisponible(cotizacionActual, { session });
          if (!cupo.ok) {
            throw new AprobacionRechazada(400, cupo.message);
          }

          actualizada = await Cotizacion.findOneAndUpdate(
            { _id: id, estado: 'pendiente' },
            { $set: { estado: 'aprobada', aprobada_at: new Date() } },
            { new: true, session }
          );
        });
      } catch (error) {
        if (error instanceof AprobacionRechazada) {
          return res.status(error.status).json({ success: false, message: error.message });
        }
        throw error;
      } finally {
        await session.endSession();
      }
    } else {
      // Rechazo: no hay chequeo de cupo, el update atómico filtrando por
      // estado esperado alcanza para evitar pisar un cambio concurrente.
      actualizada = await Cotizacion.findOneAndUpdate(
        { _id: id, estado: 'pendiente' },
        { $set: { estado, motivo_rechazo: motivoRechazoTrim } },
        { new: true }
      );

      if (!actualizada) {
        return res.status(409).json({
          success: false,
          message: 'La cotización ya no está pendiente (fue modificada por otra acción).',
        });
      }
    }

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

    res.status(200).json({
      success: true,
      data: actualizada,
    });
  } catch (error) {
    next(error);
  }
};
