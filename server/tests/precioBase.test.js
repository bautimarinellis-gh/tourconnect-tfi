const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Cotizacion = require('../models/Cotizacion');
const cotizacionController = require('../controllers/cotizacionController');
const { COTIZACION_POPULATE } = require('../utils/reservaHelpers');

// precio_base es el costo del mayorista: la agencia solo debe ver el precio
// con su markup. Estas respuestas las comparten ambos roles.

/** Query encadenable falsa que registra qué campos se pidieron al popular. */
const queryFalsa = (resultado, selects) => {
  const q = {
    populate(path, select) { selects.push(select ?? ''); return q; },
    sort() { return q; },
    then(resolve, reject) { return Promise.resolve(resultado).then(resolve, reject); },
  };
  return q;
};

const ejecutar = async (handler, req) => {
  const r = { status: 200, body: null, error: null };
  const res = {
    status(code) { r.status = code; return this; },
    json(payload) { r.body = payload; return this; },
  };
  await handler(req, res, (e) => { r.error = e; });
  return r;
};

const agencia = { rol: 'agencia', agencia_id: '64b000000000000000000002', mayorista_id: '64b000000000000000000001' };

afterEach(() => mock.restoreAll());

describe('la agencia no recibe precio_base', () => {
  test('listado de cotizaciones', async () => {
    const selects = [];
    mock.method(Cotizacion, 'find', () => queryFalsa([], selects));

    const r = await ejecutar(cotizacionController.getCotizaciones, { usuario: agencia, query: {} });

    assert.equal(r.error, null);
    assert.ok(selects.length > 0);
    for (const s of selects) assert.doesNotMatch(s, /precio_base/);
  });

  test('detalle de cotización', async () => {
    const selects = [];
    mock.method(Cotizacion, 'findById', () => queryFalsa(null, selects));

    await ejecutar(cotizacionController.getCotizacionById, { usuario: agencia, params: { id: 'x' } });

    assert.ok(selects.length > 0);
    for (const s of selects) assert.doesNotMatch(s, /precio_base/);
  });

  test('reservas (populate compartido)', () => {
    const producto = COTIZACION_POPULATE.populate.find((p) => p.path === 'producto_id');
    assert.doesNotMatch(producto.select, /precio_base/);
  });
});
