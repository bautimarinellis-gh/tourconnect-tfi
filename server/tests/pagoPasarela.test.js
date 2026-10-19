const { test, describe, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Antes de requerir el módulo: pagoPasarela toma la referencia al cargarse.
const auditService = require('../utils/auditService');
const auditorias = [];
mock.method(auditService, 'registrarAuditoria', async (a) => { auditorias.push(a); });

const Reserva = require('../models/Reserva');
const Pago = require('../models/Pago');
const IntentoPago = require('../models/IntentoPago');
const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');
const { aplicarPagoMercadoPago } = require('../utils/pagoPasarela');
const mercadoPago = require('../utils/mercadoPago');

const RESERVA = '64b0000000000000000000aa';
const sesionFalsa = { withTransaction: async (fn) => fn(), endSession: async () => {} };

/** Resultado de findOne que se puede esperar directo o encadenar .sort()/.session(). */
const consulta = (valor) => ({
  sort: () => consulta(valor),
  session: () => consulta(valor),
  then: (ok, error) => Promise.resolve(valor).then(ok, error),
});

const pagoMP = (extra = {}) => ({
  id: 123456789,
  external_reference: RESERVA,
  status: 'approved',
  status_detail: 'accredited',
  currency_id: 'ARS',
  transaction_amount: 150000,
  payment_method_id: 'visa',
  date_approved: '2026-10-14T15:00:00.000-03:00',
  ...extra,
});

describe('aplicarPagoMercadoPago', () => {
  let reserva;
  let intento;
  let existente;
  let updates;
  let creados;
  let historial;

  beforeEach(() => {
    auditorias.length = 0;
    updates = [];
    creados = [];
    historial = [];
    existente = null;
    reserva = { _id: RESERVA, estado: 'pendiente_pago', mayorista_id: 'm1', agencia_id: 'a1' };
    intento = {
      reserva_id: RESERVA,
      iniciado_por: 'u1',
      preference_id: 'pref-1',
      monto_usd: 100,
      tipo_cambio: 1500,
      monto_ars: 150000,
      estado: 'creado',
      save: async () => {},
    };

    mock.method(mongoose, 'startSession', async () => sesionFalsa);
    mock.method(Reserva, 'findById', async () => reserva);
    mock.method(IntentoPago, 'findOne', (filtro) => consulta(filtro.payment_id ? null : intento));
    mock.method(Pago, 'findOne', () => consulta(existente));
    mock.method(Pago, 'create', async ([doc]) => { creados.push(doc); return [doc]; });
    mock.method(Pago, 'updateMany', async () => ({}));
    mock.method(Reserva, 'findOneAndUpdate', async (filtro, cambios) => {
      updates.push({ filtro, cambios });
      const estados = filtro.estado?.$in ?? [filtro.estado];
      return estados.includes(reserva.estado) ? { ...reserva } : null;
    });
    mock.method(HistorialEstadoReserva, 'create', async ([registro]) => { historial.push(registro); return [registro]; });
  });

  afterEach(() => mock.restoreAll());

  test('aprobado: registra el pago de la pasarela y pasa la reserva a pagada, firmado por el Sistema', async () => {
    const r = await aplicarPagoMercadoPago(pagoMP());

    assert.equal(r.resultado, 'acreditado');
    assert.equal(updates[0].cambios.$set.estado, 'pagada');
    assert.equal(creados.length, 1);
    assert.equal(creados[0].origen, 'pasarela');
    assert.equal(creados[0].metodo, 'mercadopago');
    assert.equal(creados[0].monto, 100); // en USD, como el resto del sistema
    assert.equal(creados[0].comprobante, '123456789');
    assert.equal(creados[0].pasarela.monto_ars, 150000);
    assert.equal(historial[0].usuario_id, null);
    assert.equal(historial[0].estado_nuevo, 'pagada');
    assert.equal(intento.estado, 'aprobado');
    assert.equal(auditorias[0].accion, 'PAGO_CONFIRMADO');
  });

  test('es idempotente: el mismo pago aprobado dos veces no se registra de nuevo', async () => {
    existente = { pasarela: { status: 'approved' } };

    const r = await aplicarPagoMercadoPago(pagoMP());

    assert.equal(r.resultado, 'sin_cambios');
    assert.equal(creados.length, 0);
    assert.equal(updates.length, 0);
  });

  test('no acredita si el monto cobrado no es el del checkout', async () => {
    const r = await aplicarPagoMercadoPago(pagoMP({ transaction_amount: 1 }));

    assert.equal(r.resultado, 'monto_invalido');
    assert.equal(updates.length, 0);
    assert.equal(auditorias[0].resultado, 'fallido');
  });

  test('no acredita si la moneda no es ARS', async () => {
    const r = await aplicarPagoMercadoPago(pagoMP({ currency_id: 'USD' }));
    assert.equal(r.resultado, 'monto_invalido');
  });

  test('pendiente (efectivo): la reserva pasa a pago_informado con el pago de la pasarela', async () => {
    const r = await aplicarPagoMercadoPago(pagoMP({ status: 'pending', status_detail: 'pending_waiting_payment' }));

    assert.equal(r.resultado, 'pendiente');
    assert.deepEqual(updates[0].filtro, { _id: RESERVA, estado: 'pendiente_pago' });
    assert.equal(updates[0].cambios.$set.estado, 'pago_informado');
    assert.equal(creados[0].origen, 'pasarela');
    assert.equal(historial[0].estado_nuevo, 'pago_informado');
  });

  test('un pendiente que después se acredita actualiza el mismo pago y pasa a pagada', async () => {
    reserva.estado = 'pago_informado';
    existente = { pasarela: { status: 'pending' }, save: async () => {} };

    const r = await aplicarPagoMercadoPago(pagoMP());

    assert.equal(r.resultado, 'acreditado');
    assert.equal(creados.length, 0);
    assert.equal(existente.pasarela.status, 'approved');
    assert.equal(historial[0].estado_anterior, 'pago_informado');
  });

  test('un pendiente rechazado vuelve la reserva a pendiente_pago con el motivo visible', async () => {
    reserva.estado = 'pago_informado';
    existente = { pasarela: { status: 'pending' }, save: async () => {} };

    const r = await aplicarPagoMercadoPago(pagoMP({ status: 'rejected', status_detail: 'cc_rejected_other_reason' }));

    assert.equal(r.resultado, 'rechazado');
    assert.equal(existente.rechazado, true);
    assert.equal(updates[0].cambios.$set.estado, 'pendiente_pago');
    assert.match(historial[0].comentario, /^Pago rechazado\. Motivo: /);
  });

  test('un rechazo en el acto no cambia la reserva: solo queda el intento', async () => {
    const r = await aplicarPagoMercadoPago(pagoMP({ status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }));

    assert.equal(r.resultado, 'rechazado');
    assert.equal(updates.length, 0);
    assert.equal(creados.length, 0);
    assert.equal(intento.estado, 'rechazado');
    assert.equal(intento.status_detail, 'cc_rejected_insufficient_amount');
  });

  test('aprobado sobre una reserva cancelada: no se aplica y queda auditado para devolver', async () => {
    reserva.estado = 'cancelada';

    const r = await aplicarPagoMercadoPago(pagoMP());

    assert.equal(r.resultado, 'no_aplicable');
    assert.equal(creados.length, 0);
    assert.equal(auditorias[0].resultado, 'fallido');
  });

  test('ignora pagos que no referencian una reserva', async () => {
    const r = await aplicarPagoMercadoPago(pagoMP({ external_reference: 'cualquier-cosa' }));
    assert.equal(r.resultado, 'ignorado');
  });
});

describe('cliente de Mercado Pago', () => {
  const entornoOriginal = { ...process.env };

  afterEach(() => {
    mock.restoreAll();
    process.env = { ...entornoOriginal };
  });

  test('convierte dólares a pesos con dos decimales', () => {
    assert.equal(mercadoPago.convertirAPesos(123.45, 1450.5), 179064.23);
  });

  test('valida la firma x-signature del webhook', () => {
    const secreto = 'secreto-de-prueba';
    const ts = '1760450000';
    const firma = crypto.createHmac('sha256', secreto)
      .update(`id:123;request-id:req-1;ts:${ts};`).digest('hex');

    assert.equal(mercadoPago.validarFirmaWebhook({
      xSignature: `ts=${ts},v1=${firma}`, xRequestId: 'req-1', dataId: '123', secreto,
    }), true);
    assert.equal(mercadoPago.validarFirmaWebhook({
      xSignature: `ts=${ts},v1=${firma}`, xRequestId: 'req-1', dataId: '999', secreto,
    }), false);
    assert.equal(mercadoPago.validarFirmaWebhook({
      xSignature: undefined, xRequestId: 'req-1', dataId: '123', secreto,
    }), false);
  });

  test('con credenciales TEST- crea la preferencia en pesos y devuelve el checkout de sandbox', async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-123';
    process.env.CLIENT_URL = 'http://localhost:5173';
    let enviado;
    mock.method(global, 'fetch', async (url, opciones) => {
      enviado = { url, cuerpo: JSON.parse(opciones.body) };
      return { ok: true, json: async () => ({ id: 'pref-1', init_point: 'https://real', sandbox_init_point: 'https://sandbox' }) };
    });

    const r = await mercadoPago.crearPreferencia({
      reservaId: RESERVA, mayoristaId: 'm1', titulo: 'Reserva #0000AA', montoArs: 150000,
    });

    assert.equal(r.url_checkout, 'https://sandbox');
    assert.match(enviado.url, /\/checkout\/preferences$/);
    assert.equal(enviado.cuerpo.items[0].currency_id, 'ARS');
    assert.equal(enviado.cuerpo.items[0].unit_price, 150000);
    assert.equal(enviado.cuerpo.external_reference, RESERVA);
    assert.equal(enviado.cuerpo.auto_return, undefined); // localhost: MP no lo acepta
  });

  test('se niega a operar con credenciales de una cuenta real', async () => {
    process.env.MP_ACCESS_TOKEN = 'APP_USR-cuenta-real';
    mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ id: 1, tags: ['normal'] }) }));

    await assert.rejects(
      mercadoPago.crearPreferencia({ reservaId: RESERVA, titulo: 'x', montoArs: 1 }),
      /no son de prueba/
    );
  });

  test('acepta un usuario de prueba de MP (tag test_user)', async () => {
    process.env.MP_ACCESS_TOKEN = 'APP_USR-usuario-de-prueba';
    mock.method(global, 'fetch', async (url) => ({
      ok: true,
      json: async () => (url.endsWith('/users/me')
        ? { id: 1, tags: ['test_user'] }
        : { id: 'pref-2', init_point: 'https://checkout' }),
    }));

    const r = await mercadoPago.crearPreferencia({ reservaId: RESERVA, titulo: 'x', montoArs: 1 });
    assert.equal(r.url_checkout, 'https://checkout');
  });
});
