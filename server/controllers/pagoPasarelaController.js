const Reserva = require('../models/Reserva');
const IntentoPago = require('../models/IntentoPago');
const { COTIZACION_POPULATE, validarAccesoReserva, obtenerPrecioFinal } = require('../utils/reservaHelpers');
const mercadoPago = require('../utils/mercadoPago');
const { aplicarPagoMercadoPago } = require('../utils/pagoPasarela');

// =============================================
// PASARELA DE PAGOS — Mercado Pago (Checkout Pro, credenciales de prueba)
// =============================================

const cargarReserva = async (req, res) => {
  const reserva = await Reserva.findById(req.params.id).populate(COTIZACION_POPULATE);
  if (!reserva) {
    res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    return null;
  }
  const acceso = validarAccesoReserva(reserva, req.usuario);
  if (!acceso.ok) {
    res.status(acceso.status).json({ success: false, message: acceso.message });
    return null;
  }
  return reserva;
};

/**
 * POST /api/v1/reservas/:id/mercadopago/checkout
 * La agencia inicia el pago: se crea la preferencia y se devuelve la URL del
 * checkout. El monto sale de la cotización, nunca del cliente.
 */
exports.iniciarCheckout = async (req, res, next) => {
  try {
    if (!mercadoPago.estaConfigurado()) {
      return res.status(503).json({
        success: false,
        message: 'La pasarela de pagos no está configurada en el servidor',
      });
    }

    const reserva = await cargarReserva(req, res);
    if (!reserva) return;

    if (reserva.estado !== 'pendiente_pago') {
      return res.status(400).json({
        success: false,
        message: 'Solo se puede pagar una reserva que está pendiente de pago',
      });
    }

    const montoUsd = obtenerPrecioFinal(reserva);
    if (!montoUsd) {
      return res.status(400).json({ success: false, message: 'La reserva no tiene un precio válido' });
    }

    const tipoCambio = mercadoPago.tipoDeCambio();
    const montoArs = mercadoPago.convertirAPesos(montoUsd, tipoCambio);
    const cot = reserva.cotizacion_id;
    const codigo = reserva._id.toString().slice(-6).toUpperCase();
    const titulo = `Reserva #${codigo} - ${cot.producto_id?.nombre || 'Servicio turístico'}`;

    const { preference_id, url_checkout } = await mercadoPago.crearPreferencia({
      reservaId: reserva._id,
      mayoristaId: reserva.mayorista_id,
      titulo,
      montoArs,
    });

    await IntentoPago.create({
      reserva_id: reserva._id,
      mayorista_id: reserva.mayorista_id,
      agencia_id: reserva.agencia_id,
      iniciado_por: req.usuario.id,
      preference_id,
      monto_usd: montoUsd,
      tipo_cambio: tipoCambio,
      monto_ars: montoArs,
    });

    res.status(201).json({
      success: true,
      data: { url_checkout, preference_id, monto_ars: montoArs, tipo_cambio: tipoCambio },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reservas/:id/mercadopago/verificar
 * Al volver del checkout, el front manda el payment_id que MP puso en la URL.
 * El estado se consulta a MP con ese id (los parámetros de la URL se pueden
 * editar a mano). Sin payment_id se busca el último pago de la reserva: sirve
 * para conciliar sin webhook, por ejemplo un pago en efectivo que se acreditó
 * después.
 */
exports.verificarPago = async (req, res, next) => {
  try {
    if (!mercadoPago.estaConfigurado()) {
      return res.status(503).json({
        success: false,
        message: 'La pasarela de pagos no está configurada en el servidor',
      });
    }

    const reserva = await cargarReserva(req, res);
    if (!reserva) return;

    const { payment_id: paymentId } = req.body ?? {};
    if (paymentId !== undefined && !/^\d{1,30}$/.test(String(paymentId))) {
      return res.status(400).json({ success: false, message: 'El payment_id no es válido' });
    }

    const pagoMP = paymentId
      ? await mercadoPago.obtenerPago(String(paymentId), reserva.mayorista_id)
      : await mercadoPago.buscarUltimoPagoDeReserva(reserva._id, reserva.mayorista_id);

    if (!pagoMP) {
      return res.status(200).json({ success: true, data: { resultado: 'sin_pago' } });
    }

    if (String(pagoMP.external_reference) !== reserva._id.toString()) {
      return res.status(400).json({ success: false, message: 'El pago no corresponde a esta reserva' });
    }

    const resultado = await aplicarPagoMercadoPago(pagoMP);
    res.status(200).json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/webhooks/mercadopago
 * Notificación de MP. Es pública (la llama MP, no un usuario logueado):
 *  - si hay MP_WEBHOOK_SECRET, se exige la firma x-signature;
 *  - aun sin firma, la notificación no alcanza para pagar nada: solo trae un
 *    id, y el estado real se lee de la API de MP con el token propio.
 * Responde 200 lo antes posible; un 500 hace que MP reintente.
 */
exports.webhook = async (req, res) => {
  const tipo = req.query.type || req.query.topic || req.body?.type;
  const dataId = req.query['data.id'] || req.body?.data?.id || req.query.id;

  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (secreto) {
    const firmaOk = mercadoPago.validarFirmaWebhook({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId: req.query['data.id'] ?? dataId,
      secreto,
    });
    if (!firmaOk) return res.status(401).json({ success: false, message: 'Firma inválida' });
  }

  if (tipo !== 'payment' || !dataId || !/^\d{1,30}$/.test(String(dataId))) {
    return res.status(200).json({ success: true, ignorado: true });
  }

  try {
    // Con una sola cuenta de prueba no hace falta saber el mayorista para
    // elegir credenciales (ver credencialesPara en utils/mercadoPago).
    const pagoMP = await mercadoPago.obtenerPago(String(dataId));
    const resultado = await aplicarPagoMercadoPago(pagoMP);
    res.status(200).json({ success: true, resultado: resultado.resultado });
  } catch (error) {
    console.error('[MercadoPago] Error procesando webhook:', error.message, error.detalle ?? '');
    res.status(500).json({ success: false });
  }
};
