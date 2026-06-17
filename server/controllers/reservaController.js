const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');
const Pago = require('../models/Pago');
const { registrarCambioEstado } = require('../utils/historialEstadoReserva');
const {
  COTIZACION_POPULATE,
  enriquecerReserva,
  buildCotizacionIdsFilter,
  validarAccesoReserva,
  obtenerPrecioFinal,
  extraerUltimoRechazo,
} = require('../utils/reservaHelpers');

// =============================================
// RESERVAS
// =============================================

exports.getReservas = async (req, res, next) => {
  try {
    const { estado, agencia_id: filtroAgencia, desde, hasta } = req.query;

    const cotizacionIds = await buildCotizacionIdsFilter(req.usuario, {
      agencia_id: filtroAgencia,
      desde,
      hasta,
    });

    if (cotizacionIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const query = { cotizacion_id: { $in: cotizacionIds } };
    if (estado) query.estado = estado;

    const reservas = await Reserva.find(query)
      .populate(COTIZACION_POPULATE)
      .sort({ created_at: -1 });

    res.status(200).json({
      success: true,
      data: reservas.map((r) => enriquecerReserva(r)),
    });
  } catch (error) {
    next(error);
  }
};

exports.createReservaFromCotizacion = async (req, res, next) => {
  req.body.cotizacion_id = req.params.cotizacionId;
  return exports.createReserva(req, res, next);
};

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

    const cotizacion = await Cotizacion.findById(cotizacion_id).session(session);
    if (!cotizacion) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Cotización no encontrada',
      });
    }

    if (cotizacion.estado !== 'aprobada') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede crear una reserva a partir de una cotización aprobada',
      });
    }

    if (cotizacion.agencia_id.toString() !== agencia_id.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para crear una reserva con esta cotización',
      });
    }

    const reservaExistente = await Reserva.findOne({ cotizacion_id: cotizacion._id }).session(session);
    if (reservaExistente) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Esta cotización ya fue convertida en una reserva',
      });
    }

    const [reserva] = await Reserva.create(
      [{ cotizacion_id: cotizacion._id, estado: 'pendiente_pago' }],
      { session }
    );

    cotizacion.estado = 'reserva_generada';
    await cotizacion.save({ session });

    await registrarCambioEstado(reserva._id, usuario_id, null, 'pendiente_pago', null, session);

    await session.commitTransaction();
    session.endSession();

    const reservaPoblada = await Reserva.findById(reserva._id).populate(COTIZACION_POPULATE);

    res.status(201).json({
      success: true,
      data: enriquecerReserva(reservaPoblada),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.getReservaById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE);

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    const [historial, pagos] = await Promise.all([
      HistorialEstadoReserva.find({ reserva_id: id })
        .populate('usuario_id', 'email rol')
        .sort({ created_at: 1 }),
      Pago.find({ reserva_id: id }).sort({ created_at: 1 }),
    ]);

    const ultimoRechazo = extraerUltimoRechazo(historial);
    const pagoPendiente =
      reserva.estado === 'pago_informado' && pagos.length > 0 ? pagos[pagos.length - 1] : null;

    res.status(200).json({
      success: true,
      data: enriquecerReserva(reserva, {
        historial,
        pagos,
        pago_pendiente: pagoPendiente,
        pago_informado_datos: pagoPendiente,
        rechazo_datos: ultimoRechazo,
        ultimo_rechazo: ultimoRechazo,
      }),
    });
  } catch (error) {
    next(error);
  }
};

exports.pagarReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { mayorista_id, id: usuario_id } = req.usuario;
    const { monto, fecha_pago, metodo, comprobante, notas } = req.body;

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    if (!['pendiente_pago', 'pago_informado'].includes(reserva.estado)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede marcar como pagada una reserva en estado pendiente de pago o pago informado',
      });
    }

    const pagosExistentes = await Pago.countDocuments({ reserva_id: reserva._id }).session(session);
    if (pagosExistentes === 0 && monto && fecha_pago) {
      await Pago.create(
        [
          {
            reserva_id: reserva._id,
            registrado_por: usuario_id,
            monto,
            metodo: metodo || 'transferencia',
            comprobante: comprobante || null,
            notas: notas || null,
            fecha_pago: new Date(fecha_pago),
          },
        ],
        { session }
      );
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pagada';
    await reserva.save({ session });

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'pagada',
      'Pago registrado por el mayorista',
      session
    );

    await session.commitTransaction();
    session.endSession();

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);
    res.status(200).json({ success: true, data: enriquecerReserva(actualizada) });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.cerrarReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { id: usuario_id } = req.usuario;

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(acceso.status).json({ success: false, message: acceso.message });
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

    await registrarCambioEstado(reserva._id, usuario_id, estadoAnterior, 'cerrada', null, session);

    await session.commitTransaction();
    session.endSession();

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);
    res.status(200).json({ success: true, data: enriquecerReserva(actualizada) });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.cancelarReserva = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { id: usuario_id } = req.usuario;
    const { motivo_cancelacion } = req.body;

    if (!motivo_cancelacion) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'El motivo de cancelación es obligatorio',
      });
    }

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    if (reserva.estado === 'cerrada') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Una reserva cerrada no puede ser cancelada',
      });
    }

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

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);
    res.status(200).json({ success: true, data: enriquecerReserva(actualizada) });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.getHistorial = async (req, res, next) => {
  try {
    const { id } = req.params;

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE);

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    const historial = await HistorialEstadoReserva.find({ reserva_id: id })
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

exports.createPago = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: usuario_id } = req.usuario;
    const { monto, fecha_pago, metodo, comprobante, notas } = req.body;

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

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE);

    if (!reserva) {
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    const pago = await Pago.create({
      reserva_id: reserva._id,
      registrado_por: usuario_id,
      monto,
      metodo: metodo || 'transferencia',
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

exports.informarPago = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { id: usuario_id } = req.usuario;
    const { metodo, comprobante, fecha_pago, monto, notas } = req.body;

    if (!metodo || !fecha_pago || !monto) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Los campos metodo, fecha_pago y monto son obligatorios',
      });
    }

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    if (reserva.estado !== 'pendiente_pago') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede informar un pago cuando la reserva está en estado pendiente de pago',
      });
    }

    const precioFinal = obtenerPrecioFinal(reserva);
    const montoInformado = parseFloat(monto);

    if (precioFinal === null || Math.abs(montoInformado - precioFinal) > 0.01) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `El monto informado ($${montoInformado}) no coincide con el precio total de la reserva ($${precioFinal})`,
      });
    }

    await Pago.create(
      [
        {
          reserva_id: reserva._id,
          registrado_por: usuario_id,
          monto: montoInformado,
          metodo,
          comprobante: comprobante || null,
          notas: notas || null,
          fecha_pago: new Date(fecha_pago),
        },
      ],
      { session }
    );

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pago_informado';
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

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);
    const pagos = await Pago.find({ reserva_id: id }).sort({ created_at: 1 });
    const pagoPendiente = pagos[pagos.length - 1];

    res.status(200).json({
      success: true,
      data: enriquecerReserva(actualizada, {
        pago_pendiente: pagoPendiente,
        pago_informado_datos: pagoPendiente,
      }),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.confirmarPago = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { id: usuario_id } = req.usuario;

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    if (reserva.estado !== 'pago_informado') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede confirmar el pago cuando la reserva está en estado pago informado',
      });
    }

    const pagoPendiente = await Pago.findOne({ reserva_id: reserva._id })
      .sort({ created_at: -1 })
      .session(session);

    if (!pagoPendiente) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No hay un pago informado para confirmar',
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
      'Pago confirmado por el mayorista',
      session
    );

    await session.commitTransaction();
    session.endSession();

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);
    res.status(200).json({ success: true, data: enriquecerReserva(actualizada) });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.rechazarPago = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { id: usuario_id } = req.usuario;
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'El motivo del rechazo es obligatorio' });
    }

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE).session(session);

    if (!reserva) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      await session.abortTransaction();
      session.endSession();
      return res.status(acceso.status).json({ success: false, message: acceso.message });
    }

    if (reserva.estado !== 'pago_informado') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo se puede rechazar el pago cuando la reserva está en estado pago informado',
      });
    }

    await Pago.deleteMany({ reserva_id: reserva._id }).session(session);

    const estadoAnterior = reserva.estado;
    reserva.estado = 'pendiente_pago';
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

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);
    res.status(200).json({
      success: true,
      data: enriquecerReserva(actualizada, {
        rechazo_datos: { motivo: motivo.trim(), rechazado_at: new Date() },
      }),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.getPagos = async (req, res, next) => {
  try {
    const { id } = req.params;

    const reserva = await Reserva.findById(id).populate(COTIZACION_POPULATE);

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada',
      });
    }

    const acceso = validarAccesoReserva(reserva, req.usuario);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ success: false, message: acceso.message });
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
