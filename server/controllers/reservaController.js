const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');
const Pago = require('../models/Pago');
const Agencia = require('../models/Agencia');
const IntentoPago = require('../models/IntentoPago');
const mercadoPago = require('../utils/mercadoPago');
const { resolverPagosAlCancelar } = require('../utils/devolucionPagos');
const { registrarCambioEstado } = require('../utils/historialEstadoReserva');
const { registrarAuditoria } = require('../utils/auditService');
const {
  COTIZACION_POPULATE,
  enriquecerReserva,
  buildCotizacionIdsFilter,
  validarAccesoReserva,
  obtenerPrecioFinal,
  extraerUltimoRechazo,
} = require('../utils/reservaHelpers');
const { hoyDateString, toDateString } = require('../utils/dateHelpers');
const { estaVigente } = require('../utils/vigenciaCotizacion');
const { leerPaginacion, describirPagina } = require('../utils/paginacion');

/** El texto del usuario se busca literal: sin esto, "(" o ".*" serían regex. */
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// =============================================
// RESERVAS
// =============================================

exports.getReservas = async (req, res, next) => {
  try {
    const { rol, mayorista_id, agencia_id } = req.usuario;
    const { estado, agencia_id: filtroAgencia, buscar_agencia: buscarAgencia, desde, hasta } = req.query;

    // Filtro por tenant sobre la propia reserva (campos indexados), en vez de
    // juntar primero los ids de todas las cotizaciones del tenant.
    const query = {};
    if (rol === 'mayorista') {
      query.mayorista_id = mayorista_id;
      if (filtroAgencia) {
        if (!mongoose.Types.ObjectId.isValid(filtroAgencia)) {
          return res.status(400).json({
            success: false,
            message: 'El parámetro agencia_id no es un identificador válido',
          });
        }
        query.agencia_id = filtroAgencia;
      }
      // Búsqueda por nombre de agencia: se resuelve acá y no en el navegador,
      // porque con paginación el cliente solo tiene la página actual.
      if (!filtroAgencia && typeof buscarAgencia === 'string' && buscarAgencia.trim()) {
        const patron = new RegExp(escaparRegex(buscarAgencia.trim().slice(0, 100)), 'i');
        const ids = await Agencia.find({ mayorista_id, nombre: patron }).distinct('_id');
        query.agencia_id = { $in: ids };
      }
    } else {
      query.agencia_id = agencia_id;
    }
    if (estado) query.estado = estado;

    // El rango de fechas es sobre la fecha del viaje, que vive en la cotización.
    if (desde || hasta) {
      query.cotizacion_id = { $in: await buildCotizacionIdsFilter(req.usuario, { desde, hasta }) };
    }

    const paginacion = leerPaginacion(req.query);
    let consulta = Reserva.find(query).populate(COTIZACION_POPULATE).sort({ created_at: -1 });
    if (paginacion) consulta = consulta.skip(paginacion.skip).limit(paginacion.limit);

    const [reservas, total] = await Promise.all([
      consulta,
      paginacion ? Reserva.countDocuments(query) : null,
    ]);

    res.status(200).json({
      success: true,
      data: reservas.map((r) => enriquecerReserva(r)),
      ...(paginacion && { pagination: describirPagina(paginacion, total) }),
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

    // CU-06, escenario alternativo 2: la aprobación tiene un plazo para
    // confirmarse (ver utils/vigenciaCotizacion.js). Se chequea acá además del
    // cron, que corre cada hora.
    if (!estaVigente(cotizacion)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'La cotización venció: superó el plazo para confirmar la reserva.',
      });
    }

    // Igual que en la aprobación: pueden pasar días entre que se aprueba la
    // cotización y que la agencia genera la reserva. Si para entonces el
    // viaje ya empezó, no tiene sentido reservarlo.
    if (toDateString(cotizacion.fecha_inicio) < hoyDateString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No se puede generar la reserva: la fecha de inicio del viaje ya pasó.',
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
      [{
        cotizacion_id: cotizacion._id,
        mayorista_id: cotizacion.mayorista_id,
        agencia_id: cotizacion.agencia_id,
        estado: 'pendiente_pago',
      }],
      { session }
    );

    cotizacion.estado = 'reserva_generada';
    await cotizacion.save({ session });

    await registrarCambioEstado(reserva._id, usuario_id, null, 'pendiente_pago', null, session);

    await session.commitTransaction();
    session.endSession();

    const reservaPoblada = await Reserva.findById(reserva._id).populate(COTIZACION_POPULATE);

    registrarAuditoria({
      req,
      accion: 'RESERVA_CREADA',
      entidad_afectada: 'Reserva',
      entidad_id: reserva._id,
      detalle: { cotizacion_id },
    });

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

    const [historial, pagos, ultimoIntento] = await Promise.all([
      HistorialEstadoReserva.find({ reserva_id: id })
        .populate('usuario_id', 'email rol')
        .sort({ created_at: 1 }),
      Pago.find({ reserva_id: id }).sort({ created_at: 1 }),
      IntentoPago.findOne({ reserva_id: id })
        .sort({ created_at: -1 })
        .select('estado status_detail monto_ars tipo_cambio created_at'),
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
        pasarela: {
          disponible: mercadoPago.estaConfigurado(),
          tipo_cambio: mercadoPago.tipoDeCambio(),
          ultimo_intento: ultimoIntento,
        },
      }),
    });
  } catch (error) {
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

    registrarAuditoria({
      req,
      accion: 'RESERVA_CERRADA',
      entidad_afectada: 'Reserva',
      entidad_id: reserva._id,
    });

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
    const motivoCancelacionTrim =
      typeof req.body.motivo_cancelacion === 'string' ? req.body.motivo_cancelacion.trim() : '';

    if (!motivoCancelacionTrim) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'El motivo de cancelación es obligatorio',
      });
    }

    if (motivoCancelacionTrim.length > 500) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'El motivo de cancelación no puede superar los 500 caracteres',
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

    // La agencia solo cancela lo que todavía no pagó: con plata de por medio,
    // la devolución la decide y la gestiona el mayorista.
    if (req.usuario.rol === 'agencia' && reserva.estado !== 'pendiente_pago') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Solo podés cancelar una reserva que todavía no pagaste. Si ya pagaste, pedile la cancelación al mayorista: él gestiona la devolución.',
      });
    }

    let devoluciones = { cambios: [], resumen: [], devueltos: [] };
    if (['pagada', 'pago_informado'].includes(reserva.estado)) {
      const pagos = await Pago.find({ reserva_id: reserva._id }).sort({ created_at: 1 }).session(session);
      try {
        devoluciones = await resolverPagosAlCancelar({
          reserva,
          pagos,
          devolucionManual: req.body.devolucion,
          usuarioId: usuario_id,
        });
      } catch (error) {
        if (!(error instanceof mercadoPago.MercadoPagoError)) throw error;
        await session.abortTransaction();
        session.endSession();
        return res.status(502).json({
          success: false,
          message: `No se pudo devolver el pago en Mercado Pago (${error.detalle || error.message}). La reserva no se canceló.`,
        });
      }
      if (devoluciones.error) {
        await session.abortTransaction();
        session.endSession();
        const { status, message, code } = devoluciones.error;
        return res.status(status).json({ success: false, message, code });
      }
    }

    const estadoAnterior = reserva.estado;
    reserva.estado = 'cancelada';
    reserva.motivo_cancelacion = motivoCancelacionTrim;
    await reserva.save({ session });

    for (const { pago, set } of devoluciones.cambios) {
      pago.set(set);
      await pago.save({ session });
    }

    await registrarCambioEstado(
      reserva._id,
      usuario_id,
      estadoAnterior,
      'cancelada',
      [motivoCancelacionTrim, ...devoluciones.resumen].join('. '),
      session
    );

    await session.commitTransaction();
    session.endSession();

    const actualizada = await Reserva.findById(id).populate(COTIZACION_POPULATE);

    registrarAuditoria({
      req,
      accion: 'RESERVA_CANCELADA',
      entidad_afectada: 'Reserva',
      entidad_id: reserva._id,
      detalle: { motivo_cancelacion: motivoCancelacionTrim },
    });

    for (const devuelto of devoluciones.devueltos) {
      registrarAuditoria({
        req,
        accion: 'PAGO_DEVUELTO',
        entidad_afectada: 'Reserva',
        entidad_id: reserva._id,
        detalle: devuelto,
      });
    }

    res.status(200).json({ success: true, data: enriquecerReserva(actualizada) });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// =============================================
// PAGOS
// =============================================

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

    if (comprobante && !/^\d+$/.test(comprobante)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'El número de comprobante solo puede contener números',
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

    registrarAuditoria({
      req,
      accion: 'PAGO_INFORMADO',
      entidad_afectada: 'Reserva',
      entidad_id: reserva._id,
      detalle: { monto: montoInformado, metodo, fecha_pago },
    });

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

    if (pagoPendiente.origen === 'pasarela') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Este pago lo acredita Mercado Pago automáticamente; no se confirma a mano',
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

    registrarAuditoria({
      req,
      accion: 'PAGO_CONFIRMADO',
      entidad_afectada: 'Reserva',
      entidad_id: reserva._id,
      detalle: { monto: pagoPendiente.monto },
    });

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

    // Marcar el pago vigente como rechazado en vez de borrarlo — queda
    // como evidencia de la operación. .sort({ created_at: -1 }) toma el
    // más reciente, igual que confirmarPago, para no tocar por error un
    // pago de un ciclo informar→rechazar anterior si hubiera más de uno.
    const pagoVigente = await Pago.findOne({ reserva_id: reserva._id, rechazado: false })
      .sort({ created_at: -1 })
      .session(session);
    if (pagoVigente?.origen === 'pasarela') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Este pago lo resuelve Mercado Pago; no se puede rechazar a mano',
      });
    }
    if (pagoVigente) {
      pagoVigente.rechazado = true;
      pagoVigente.motivo_rechazo = motivo.trim();
      pagoVigente.rechazado_at = new Date();
      await pagoVigente.save({ session });
    }

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

    registrarAuditoria({
      req,
      accion: 'PAGO_RECHAZADO',
      entidad_afectada: 'Reserva',
      entidad_id: reserva._id,
      detalle: { motivo: motivo.trim() },
    });

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
