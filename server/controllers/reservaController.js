const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const EstadoReserva = require('../models/EstadoReserva');
const Pago = require('../models/Pago');
const { registrarCambioEstado } = require('../utils/estadoReserva');

// =============================================
// RESERVAS
// =============================================

// @desc    Obtener todas las reservas
// @route   GET /api/v1/reservas
// @access  Private (Mayorista o Agencia)
exports.getReservas = async (req, res, next) => {
  try {
    const { rol, mayorista_id, agencia_id } = req.usuario;
    const { estado, agencia_id: filtroAgencia, desde, hasta } = req.query;

    const query = {};

    if (rol === 'mayorista') {
      query.mayorista_id = mayorista_id;
      if (filtroAgencia) query.agencia_id = filtroAgencia;
    } else if (rol === 'agencia') {
      query.agencia_id = agencia_id;
    }

    if (estado) query.estado = estado;

    if (desde || hasta) {
      query.fecha_inicio = {};
      if (desde) query.fecha_inicio.$gte = new Date(desde);
      if (hasta) query.fecha_inicio.$lte = new Date(hasta);
    }

    let queryBuilder = Reserva.find(query)
      .populate('producto_id', 'nombre tipo precio_base')
      .sort({ created_at: -1 });

    if (rol === 'mayorista') {
      queryBuilder = queryBuilder.populate('agencia_id', 'nombre');
    }

    const reservas = await queryBuilder;

    res.status(200).json({
      success: true,
      data: reservas,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Crear reserva desde cotización confirmada (ID en URL)
// @route   POST /api/v1/reservas/cotizacion/:cotizacionId
// @access  Private (Solo Agencia)
exports.createReservaFromCotizacion = async (req, res, next) => {
  req.body.cotizacion_id = req.params.cotizacionId;
  return exports.createReserva(req, res, next);
};

// @desc    Crear reserva desde cotización confirmada
// @route   POST /api/v1/reservas
// @access  Private (Solo Agencia)
exports.createReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { agencia_id, id: usuario_id } = req.usuario;
    const { cotizacion_id } = req.body;

    if (!cotizacion_id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'El campo cotizacion_id es obligatorio',
      });
    }

    // 1. La cotización existe
    const cotizacion = await Cotizacion.findById(cotizacion_id).session(session);
    if (!cotizacion) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada',
      });
    }

    // 2. La cotización tiene estado = aprobada
    if (cotizacion.estado !== 'aprobada') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede crear una reserva a partir de una cotización aprobada',
      });
    }

    // 3. La cotización pertenece a la agencia autenticada
    if (cotizacion.agencia_id.toString() !== agencia_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear una reserva con esta cotización',
      });
    }

    // 4. La cotización no tiene reserva_id asignado
    if (cotizacion.reserva_id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Esta cotización ya fue convertida en una reserva',
      });
    }

    // Crear la reserva (dentro de la transacción)
    const [reserva] = await Reserva.create(
      [
        {
          cotizacion_id: cotizacion._id,
          agencia_id: cotizacion.agencia_id,
          producto_id: cotizacion.producto_id,
          mayorista_id: cotizacion.mayorista_id,
          pasajeros: cotizacion.pasajeros,
          fecha_inicio: cotizacion.fecha_inicio,
          fecha_fin: cotizacion.fecha_fin,
          precio_final: cotizacion.precio_total,
          estado: 'pendiente_pago',
        },
      ],
      { session }
    );

    // Actualizar cotización: vincular reserva y marcar como reserva_generada
    cotizacion.reserva_id = reserva._id;
    cotizacion.estado = 'reserva_generada';
    await cotizacion.save({ session });

    // Registrar cambio de estado
    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      null,
      'pendiente_pago',
      null,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: reserva,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    Obtener detalle de una reserva
// @route   GET /api/v1/reservas/:id
// @access  Private (Mayorista o Agencia)
exports.getReservaById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const reserva = await Reserva.findById(id)
      .populate('producto_id')
      .populate('agencia_id', 'nombre')
      .populate('mayorista_id', 'nombre razon_social');

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    // Validar pertenencia según rol
    if (rol === 'mayorista' && reserva.mayorista_id._id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta reserva',
      });
    }

    if (rol === 'agencia' && reserva.agencia_id._id.toString() !== agencia_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver esta reserva',
      });
    }

    // Historial de estados
    const historial = await EstadoReserva.find({ reserva_id: id })
      .populate('usuario_id', 'email rol')
      .sort({ created_at: 1 });

    // Pagos registrados
    const pagos = await Pago.find({ reserva_id: id }).sort({ fecha_pago: 1 });

    res.status(200).json({
      success: true,
      data: {
        ...reserva.toJSON(),
        historial,
        pagos,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Marcar reserva como pagada
// @route   PUT /api/v1/reservas/:id/pagar
// @access  Private (Solo Mayorista)
exports.pagarReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { mayorista_id, id: usuario_id } = req.usuario;

    const reserva = await Reserva.findById(id).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    if (reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar esta reserva',
      });
    }

    if (!['pendiente_pago', 'pago_informado'].includes(reserva.estado)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede marcar como pagada una reserva en estado pendiente de pago o pago informado',
      });
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pagada';
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'pagada',
      null,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: reserva,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    Cerrar reserva
// @route   PUT /api/v1/reservas/:id/cerrar
// @access  Private (Solo Mayorista)
exports.cerrarReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { mayorista_id, id: usuario_id } = req.usuario;

    const reserva = await Reserva.findById(id).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    if (reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para modificar esta reserva',
      });
    }

    if (reserva.estado !== 'pagada') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede cerrar una reserva en estado pagada',
      });
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'cerrada';
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'cerrada',
      null,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: reserva,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    Cancelar reserva
// @route   PUT /api/v1/reservas/:id/cancelar
// @access  Private (Mayorista o Agencia)
exports.cancelarReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id, id: usuario_id } = req.usuario;
    const { motivo_cancelacion } = req.body;

    if (!motivo_cancelacion) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'El motivo de cancelación es obligatorio',
      });
    }

    const reserva = await Reserva.findById(id).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    // Validar pertenencia según rol
    if (rol === 'mayorista' && reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cancelar esta reserva',
      });
    }

    if (rol === 'agencia' && reserva.agencia_id.toString() !== agencia_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para cancelar esta reserva',
      });
    }

    // Una reserva cerrada no se puede cancelar
    if (reserva.estado === 'cerrada') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Una reserva cerrada no puede ser cancelada',
      });
    }

    // Una reserva ya cancelada no se puede cancelar de nuevo
    if (reserva.estado === 'cancelada') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'La reserva ya está cancelada',
      });
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'cancelada';
    reserva.motivo_cancelacion = motivo_cancelacion;
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'cancelada',
      motivo_cancelacion,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      data: reserva,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    Obtener historial de estados de una reserva
// @route   GET /api/v1/reservas/:id/historial
// @access  Private (Mayorista o Agencia)
exports.getHistorial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const reserva = await Reserva.findById(id);

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    // Validar pertenencia según rol
    if (rol === 'mayorista' && reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver el historial de esta reserva',
      });
    }

    if (rol === 'agencia' && reserva.agencia_id.toString() !== agencia_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver el historial de esta reserva',
      });
    }

    const historial = await EstadoReserva.find({ reserva_id: id })
      .populate('usuario_id', 'email rol')
      .sort({ created_at: 1 });

    res.status(200).json({
      success: true,
      data: historial,
    });
  } catch (error) {
    next(error);
  }
};

// =============================================
// PAGOS
// =============================================

// @desc    Registrar un pago
// @route   POST /api/v1/reservas/:id/pagos
// @access  Private (Solo Mayorista)
exports.createPago = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mayorista_id, id: usuario_id } = req.usuario;
    const { monto, fecha_pago, comprobante, notas } = req.body;

    if (!monto || !fecha_pago) {
      return res.status(400).json({
        success: false,
        message: 'Los campos monto y fecha_pago son obligatorios',
      });
    }

    if (parseFloat(monto) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser positivo',
      });
    }

    const reserva = await Reserva.findById(id);

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    if (reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar pagos en esta reserva',
      });
    }

    const pago = await Pago.create({
      reserva_id: reserva._id,
      registrado_por: usuario_id,
      monto,
      fecha_pago,
      comprobante: comprobante || null,
      notas: notas || null,
    });

    res.status(201).json({
      success: true,
      data: pago,
    });
  } catch (error) {
    next(error);
  }
};

// =============================================
// FLUJO BIDIRECCIONAL DE PAGOS
// =============================================

// @desc    La agencia informa que realizó un pago
// @route   POST /api/v1/reservas/:id/informar-pago
// @access  Private (Solo Agencia)
exports.informarPago = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { agencia_id, id: usuario_id } = req.usuario;
    const { metodo, comprobante, fecha_pago, monto, notas } = req.body;

    if (!metodo || !fecha_pago || !monto) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Los campos metodo, fecha_pago y monto son obligatorios',
      });
    }

    const reserva = await Reserva.findById(id).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    if (reserva.agencia_id.toString() !== agencia_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'No tienes permisos para informar pagos en esta reserva' });
    }

    if (reserva.estado !== 'pendiente_pago') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede informar un pago cuando la reserva está en estado pendiente de pago',
      });
    }

    const precioFinal = parseFloat(reserva.precio_final.toString());
    const montoInformado = parseFloat(monto);

    if (Math.abs(montoInformado - precioFinal) > 0.01) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `El monto informado ($${montoInformado}) no coincide con el precio total de la reserva ($${precioFinal})`,
      });
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pago_informado';
    reserva.pago_informado_datos = {
      metodo,
      comprobante: comprobante || null,
      fecha_pago: new Date(fecha_pago),
      monto: montoInformado,
      notas: notas || null,
      informado_por: usuario_id,
      informado_at: new Date(),
    };
    // Limpiar rechazo anterior si existía
    reserva.rechazo_datos = undefined;
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'pago_informado',
      `Pago informado por la agencia. Método: ${metodo}`,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: reserva });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    El mayorista confirma el pago informado por la agencia
// @route   POST /api/v1/reservas/:id/confirmar-pago
// @access  Private (Solo Mayorista)
exports.confirmarPago = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { mayorista_id, id: usuario_id } = req.usuario;

    const reserva = await Reserva.findById(id).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    if (reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'No tienes permisos para confirmar pagos en esta reserva' });
    }

    if (reserva.estado !== 'pago_informado') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede confirmar el pago cuando la reserva está en estado pago informado',
      });
    }

    const datos = reserva.pago_informado_datos;

    // Crear registro oficial de Pago
    await Pago.create(
      [
        {
          reserva_id: reserva._id,
          registrado_por: usuario_id,
          monto: datos.monto,
          metodo: datos.metodo,
          comprobante: datos.comprobante || null,
          notas: datos.notas || null,
          fecha_pago: datos.fecha_pago,
        },
      ],
      { session }
    );

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pagada';
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'pagada',
      'Pago confirmado por el mayorista',
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: reserva });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    El mayorista rechaza el pago informado por la agencia
// @route   POST /api/v1/reservas/:id/rechazar-pago
// @access  Private (Solo Mayorista)
exports.rechazarPago = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { mayorista_id, id: usuario_id } = req.usuario;
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'El motivo del rechazo es obligatorio' });
    }

    const reserva = await Reserva.findById(id).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    if (reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'No tienes permisos para rechazar pagos en esta reserva' });
    }

    if (reserva.estado !== 'pago_informado') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede rechazar el pago cuando la reserva está en estado pago informado',
      });
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pendiente_pago';
    reserva.rechazo_datos = {
      motivo: motivo.trim(),
      rechazado_por: usuario_id,
      rechazado_at: new Date(),
    };
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'pendiente_pago',
      `Pago rechazado. Motivo: ${motivo.trim()}`,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: reserva });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// @desc    Listar pagos de una reserva
// @route   GET /api/v1/reservas/:id/pagos
// @access  Private (Mayorista o Agencia)
exports.getPagos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const reserva = await Reserva.findById(id);

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    // Validar pertenencia según rol
    if (rol === 'mayorista' && reserva.mayorista_id.toString() !== mayorista_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver los pagos de esta reserva',
      });
    }

    if (rol === 'agencia' && reserva.agencia_id.toString() !== agencia_id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver los pagos de esta reserva',
      });
    }

    const pagos = await Pago.find({ reserva_id: id }).sort({ fecha_pago: 1 });

    res.status(200).json({
      success: true,
      data: pagos,
    });
  } catch (error) {
    next(error);
  }
};
