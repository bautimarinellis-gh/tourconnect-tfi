const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Agencia = require('../models/Agencia');
const { lookupCotizacionStages } = require('../utils/reporteHelpers');
const { contarOperacionesActivas } = require('../utils/operacionesActivas');
const { leerPaginacion, describirPagina } = require('../utils/paginacion');
const reservaController = require('../controllers/reservaController');

const MAYORISTA = '64b000000000000000000001';
const AGENCIA = '64b000000000000000000002';

afterEach(() => mock.restoreAll());

describe('lookupCotizacionStages', () => {
  test('filtra por tenant sobre la reserva ANTES de unir con cotizaciones', () => {
    const id = new mongoose.Types.ObjectId(MAYORISTA);
    const stages = lookupCotizacionStages({ 'cot.mayorista_id': id });
    assert.deepEqual(stages[0], { $match: { mayorista_id: id } });
    assert.ok(stages[1].$lookup);
    // El filtro sobre la cotización se mantiene como segunda capa
    assert.deepEqual(stages.at(-1), { $match: { 'cot.mayorista_id': id } });
  });

  test('sin filtro de tenant no agrega el $match previo', () => {
    assert.ok(lookupCotizacionStages()[0].$lookup);
  });
});

describe('contarOperacionesActivas', () => {
  test('convierte a ObjectId los ids que llegan como texto (antes el conteo daba 0)', async () => {
    let pipeline;
    mock.method(Cotizacion, 'countDocuments', async () => 0);
    mock.method(Reserva, 'aggregate', async (p) => { pipeline = p; return [{ total: 1 }]; });

    const r = await contarOperacionesActivas({ mayorista_id: MAYORISTA }, { 'cot.mayorista_id': MAYORISTA });

    assert.equal(r.reservasActivas, 1);
    const filtro = pipeline[0].$match.mayorista_id;
    assert.ok(filtro instanceof mongoose.Types.ObjectId);
    assert.equal(String(filtro), MAYORISTA);
  });
});

describe('paginación', () => {
  test('sin page no pagina (el listado vuelve completo)', () => {
    assert.equal(leerPaginacion({}), null);
  });

  test('normaliza page y limit, con tope', () => {
    assert.deepEqual(leerPaginacion({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
    assert.deepEqual(leerPaginacion({ page: '0', limit: '5000' }), { page: 1, limit: 100, skip: 0 });
    assert.deepEqual(describirPagina({ page: 2, limit: 10 }, 25), { page: 2, limit: 10, total: 25, pages: 3 });
  });
});

describe('getReservas', () => {
  const consultaFalsa = (calls) => {
    const q = {
      populate: () => q,
      sort: () => q,
      skip: (n) => { calls.skip = n; return q; },
      limit: (n) => { calls.limit = n; return q; },
      then: (ok) => Promise.resolve([]).then(ok),
    };
    return q;
  };

  const ejecutar = async (usuario, query) => {
    const r = { status: 200, body: null };
    const res = { status(c) { r.status = c; return this; }, json(b) { r.body = b; return this; } };
    await reservaController.getReservas({ usuario, query }, res, (e) => { throw e; });
    return r;
  };

  test('el mayorista filtra por el mayorista_id de la reserva y pagina si se pide', async () => {
    const calls = {};
    const find = mock.method(Reserva, 'find', () => consultaFalsa(calls));
    mock.method(Reserva, 'countDocuments', async () => 45);

    const r = await ejecutar({ rol: 'mayorista', mayorista_id: MAYORISTA }, { estado: 'pagada', page: '2', limit: '20' });

    assert.deepEqual(find.mock.calls[0].arguments[0], { mayorista_id: MAYORISTA, estado: 'pagada' });
    assert.equal(calls.skip, 20);
    assert.deepEqual(r.body.pagination, { page: 2, limit: 20, total: 45, pages: 3 });
  });

  test('buscar_agencia busca por nombre dentro del tenant, tomando el texto literal', async () => {
    const calls = {};
    const find = mock.method(Reserva, 'find', () => consultaFalsa(calls));
    let filtroAgencias;
    mock.method(Agencia, 'find', (f) => { filtroAgencias = f; return { distinct: async () => [AGENCIA] }; });

    await ejecutar({ rol: 'mayorista', mayorista_id: MAYORISTA }, { buscar_agencia: 'Sur (Tour).*' });

    assert.equal(filtroAgencias.mayorista_id, MAYORISTA);
    assert.ok(filtroAgencias.nombre.test('VIAJES SUR (TOUR).*'));
    assert.ok(!filtroAgencias.nombre.test('Sur Tour cualquier cosa'));
    assert.deepEqual(find.mock.calls[0].arguments[0], { mayorista_id: MAYORISTA, agencia_id: { $in: [AGENCIA] } });
  });

  test('la agencia filtra por su agencia_id y sin page recibe todo', async () => {
    const calls = {};
    const find = mock.method(Reserva, 'find', () => consultaFalsa(calls));

    const r = await ejecutar({ rol: 'agencia', agencia_id: AGENCIA, mayorista_id: MAYORISTA }, {});

    assert.deepEqual(find.mock.calls[0].arguments[0], { agencia_id: AGENCIA });
    assert.equal(calls.skip, undefined);
    assert.equal(r.body.pagination, undefined);
  });
});
