const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const mercadoPago = require('../utils/mercadoPago');
const { resolverPagosAlCancelar } = require('../utils/devolucionPagos');

const reservaCon = (estado) => ({ _id: 'r1', estado, mayorista_id: 'm1' });
const pagoMP = (extra = {}) => ({
  _id: 'p-mp', origen: 'pasarela', monto: 100, rechazado: false, devuelto: false,
  pasarela: { payment_id: '555' }, ...extra,
});
const pagoManual = (extra = {}) => ({
  _id: 'p-man', origen: 'manual', monto: 100, rechazado: false, devuelto: false, ...extra,
});

describe('resolverPagosAlCancelar', () => {
  afterEach(() => mock.restoreAll());

  test('reserva pagada por MP: reembolsa por la API y marca el pago como devuelto', async () => {
    const reembolsar = mock.method(mercadoPago, 'reembolsarPago', async () => ({ id: 999, status: 'approved' }));

    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pagada'), pagos: [pagoMP()], usuarioId: 'u1' });

    assert.equal(reembolsar.mock.callCount(), 1);
    assert.equal(reembolsar.mock.calls[0].arguments[0], '555');
    assert.equal(r.cambios[0].set.devuelto, true);
    assert.equal(r.cambios[0].set.devolucion.origen, 'pasarela');
    assert.equal(r.cambios[0].set.devolucion.refund_id, '999');
    assert.match(r.resumen[0], /reembolso N° 999/);
  });

  test('reserva pagada con pago manual: sin datos de la devolución no deja cancelar', async () => {
    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pagada'), pagos: [pagoManual()], usuarioId: 'u1' });
    assert.equal(r.error.code, 'DEVOLUCION_REQUERIDA');
  });

  test('reserva pagada con pago manual: registra cómo se devolvió', async () => {
    const r = await resolverPagosAlCancelar({
      reserva: reservaCon('pagada'),
      pagos: [pagoManual()],
      devolucionManual: { metodo: 'transferencia', comprobante: '123' },
      usuarioId: 'u1',
    });

    assert.equal(r.cambios[0].set.devolucion.origen, 'manual');
    assert.equal(r.cambios[0].set.devolucion.metodo, 'transferencia');
    assert.equal(r.cambios[0].set.devolucion.comprobante, '123');
  });

  test('si MP falla, el error sube y no se arma ningún cambio', async () => {
    mock.method(mercadoPago, 'reembolsarPago', async () => {
      throw new mercadoPago.MercadoPagoError('Mercado Pago rechazó la operación');
    });

    await assert.rejects(
      resolverPagosAlCancelar({ reserva: reservaCon('pagada'), pagos: [pagoMP()], usuarioId: 'u1' }),
      mercadoPago.MercadoPagoError
    );
  });

  test('ignora los pagos rechazados o ya devueltos', async () => {
    const reembolsar = mock.method(mercadoPago, 'reembolsarPago', async () => ({ id: 1 }));

    const r = await resolverPagosAlCancelar({
      reserva: reservaCon('pagada'),
      pagos: [pagoMP({ rechazado: true }), pagoMP({ devuelto: true })],
      usuarioId: 'u1',
    });

    assert.equal(reembolsar.mock.callCount(), 0);
    assert.equal(r.cambios.length, 0);
  });

  test('pago pendiente en MP: lo anula y lo marca rechazado', async () => {
    mock.method(mercadoPago, 'obtenerPago', async () => ({ id: 555, status: 'pending' }));
    const anular = mock.method(mercadoPago, 'anularPago', async () => ({ status: 'cancelled' }));

    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pago_informado'), pagos: [pagoMP()], usuarioId: 'u1' });

    assert.equal(anular.mock.callCount(), 1);
    assert.equal(r.cambios[0].set.rechazado, true);
    assert.equal(r.devueltos.length, 0);
  });

  test('pago pendiente que justo se acreditó: se reembolsa en vez de anular', async () => {
    mock.method(mercadoPago, 'obtenerPago', async () => ({ id: 555, status: 'approved' }));
    const anular = mock.method(mercadoPago, 'anularPago', async () => ({}));
    mock.method(mercadoPago, 'reembolsarPago', async () => ({ id: 777 }));

    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pago_informado'), pagos: [pagoMP()], usuarioId: 'u1' });

    assert.equal(anular.mock.callCount(), 0);
    assert.equal(r.cambios[0].set.devuelto, true);
    assert.equal(r.devueltos[0].refund_id, '777');
  });

  test('pago manual informado sin revisar: pide confirmarlo o rechazarlo antes', async () => {
    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pago_informado'), pagos: [pagoManual()], usuarioId: 'u1' });
    assert.equal(r.error.code, 'PAGO_SIN_REVISAR');
  });

  test('reserva pendiente de pago: no hay nada que devolver', async () => {
    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pendiente_pago'), pagos: [], usuarioId: 'u1' });
    assert.deepEqual(r, { cambios: [], resumen: [], devueltos: [] });
  });
});

describe('reembolso en el cliente de MP', () => {
  const entornoOriginal = { ...process.env };
  afterEach(() => {
    mock.restoreAll();
    process.env = { ...entornoOriginal };
  });

  test('reembolsa el total con una clave de idempotencia fija por pago', async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-123';
    let llamada;
    mock.method(global, 'fetch', async (url, opciones) => {
      llamada = { url, opciones };
      return { ok: true, json: async () => ({ id: 1, status: 'approved' }) };
    });

    await mercadoPago.reembolsarPago('555');

    assert.match(llamada.url, /\/v1\/payments\/555\/refunds$/);
    assert.equal(llamada.opciones.method, 'POST');
    assert.equal(llamada.opciones.headers['X-Idempotency-Key'], 'tourconnect-reembolso-555');
  });

  const bloqueoSandbox = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: 'Unauthorized use of live credentials', status: 401, cause: [{ code: 7 }] }),
  });

  test('con cuenta de prueba, si el sandbox bloquea el reembolso, lo devuelve como simulado', async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-123';
    mock.method(global, 'fetch', bloqueoSandbox);

    const r = await mercadoPago.reembolsarPago('555');

    assert.equal(r.simulado, true);
    assert.equal(r.id, null);
  });

  test('con credenciales reales, ese mismo error nunca se simula', async () => {
    process.env.MP_ACCESS_TOKEN = 'APP_USR-cuenta-real-reembolso';
    mock.method(global, 'fetch', async (url) => (url.endsWith('/users/me')
      ? { ok: true, json: async () => ({ id: 1, tags: ['normal'] }) }
      : bloqueoSandbox()));

    await assert.rejects(mercadoPago.reembolsarPago('555'), mercadoPago.MercadoPagoError);
  });

  test('otros errores de MP no se simulan aunque la cuenta sea de prueba', async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-123';
    mock.method(global, 'fetch', async () => ({ ok: false, status: 400, json: async () => ({ message: 'Payment already refunded' }) }));

    await assert.rejects(mercadoPago.reembolsarPago('555'), mercadoPago.MercadoPagoError);
  });

  test('la devolución simulada queda marcada en el pago y en el historial', async () => {
    mock.method(mercadoPago, 'reembolsarPago', async () => ({ id: null, simulado: true }));

    const r = await resolverPagosAlCancelar({ reserva: reservaCon('pagada'), pagos: [pagoMP()], usuarioId: 'u1' });

    assert.equal(r.cambios[0].set.devuelto, true);
    assert.equal(r.cambios[0].set.devolucion.simulada, true);
    assert.equal(r.cambios[0].set.devolucion.refund_id, null);
    assert.match(r.resumen[0], /SIMULADA/);
    assert.equal(r.devueltos[0].simulada, true);
  });
});
