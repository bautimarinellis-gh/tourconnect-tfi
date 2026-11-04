// Prueba de validación de caja negra sobre CU-03 Crear cotización:
// partición en clases de equivalencia y análisis de valores límite.
// Los casos (CN-01 a CN-16) son los documentados en el anexo de Pruebas.
const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const AgenciaProducto = require('../models/AgenciaProducto');
const cotizacionController = require('../controllers/cotizacionController');
const { hoyDateString, sumarDias } = require('../utils/dateHelpers');

const ejecutar = async (handler, req) => {
  const r = { status: 200, body: null };
  const res = {
    status(code) { r.status = code; return this; },
    json(payload) { r.body = payload; return this; },
  };
  await handler({ params: {}, query: {}, body: {}, ...req }, res, (e) => { throw e; });
  return r;
};

const utc = (dia) => new Date(`${dia}T00:00:00Z`);

/** Hotel con 40 plazas por noche, disponible del 01/01/2099 al 31/01/2099. */
const hotel = {
  _id: 'p1', mayorista_id: 'm1', tipo: 'hotel', activo: true, precio_base: 100, cupo_maximo: 40,
  disponibilidad_desde: utc('2099-01-01'), disponibilidad_hasta: utc('2099-01-31'),
};

/** Mismo hotel, disponible desde hace 10 días: para probar la fecha de hoy. */
const hoy = hoyDateString();
const hotelVigente = { ...hotel, disponibilidad_desde: utc(sumarDias(hoy, -10)), disponibilidad_hasta: utc(sumarDias(hoy, 60)) };

/**
 * Crea la cotización con el producto dado y `ocupadas` plazas ya comprometidas
 * del 10 al 20/01/2099. Devuelve el status y si se llegó a crear.
 */
const cotizar = async (body, { producto = hotel, ocupadas = 0 } = {}) => {
  mock.method(AgenciaProducto, 'findOne', () => ({
    populate: async () => ({ producto_id: producto, markup_porcentaje: 10 }),
  }));
  const compromisos = ocupadas
    ? [{ _id: 'c0', estado: 'reserva_generada', pasajeros: ocupadas, fecha_inicio: utc('2099-01-10'), fecha_fin: utc('2099-01-20') }]
    : [];
  mock.method(Cotizacion, 'find', () => ({ session: async () => compromisos }));
  mock.method(Reserva, 'find', () => ({ session: () => ({ distinct: async () => [] }) }));
  const create = mock.method(Cotizacion, 'create', async (data) => data);
  const r = await ejecutar(cotizacionController.createCotizacion, {
    usuario: { agencia_id: 'a1' },
    body: { producto_id: 'p1', fecha_inicio: '2099-01-12', fecha_fin: '2099-01-14', pasajeros: 2, ...body },
  });
  return { status: r.status, mensaje: r.body?.message, creada: create.mock.callCount() > 0 };
};

afterEach(() => mock.restoreAll());

describe('CU-03 Crear cotización: pasajeros', () => {
  test('CN-01 valor límite inválido: 0 pasajeros', async () => {
    const r = await cotizar({ pasajeros: 0 });
    assert.equal(r.status, 400);
    assert.equal(r.creada, false);
  });
  test('CN-02 valor límite válido: 1 pasajero', async () => {
    const r = await cotizar({ pasajeros: 1 });
    assert.equal(r.status, 201);
  });
  test('CN-03 valor límite válido: 30 pasajeros (máximo)', async () => {
    const r = await cotizar({ pasajeros: 30 });
    assert.equal(r.status, 201);
  });
  test('CN-04 valor límite inválido: 31 pasajeros', async () => {
    const r = await cotizar({ pasajeros: 31 });
    assert.equal(r.status, 400);
    assert.match(r.mensaje, /entre 1 y 30/);
  });
  test('CN-05 clase inválida: cantidad no entera (2,5)', async () => {
    const r = await cotizar({ pasajeros: 2.5 });
    assert.equal(r.status, 400);
  });
});

describe('CU-03 Crear cotización: cupo', () => {
  test('CN-06 valor límite válido: pide exactamente las 5 plazas libres', async () => {
    const r = await cotizar({ pasajeros: 5 }, { ocupadas: 35 });
    assert.equal(r.status, 201);
  });
  test('CN-07 valor límite inválido: pide 6 con 5 plazas libres', async () => {
    const r = await cotizar({ pasajeros: 6 }, { ocupadas: 35 });
    assert.equal(r.status, 400);
    assert.match(r.mensaje, /quedan 5 de 40/);
    assert.equal(r.creada, false);
  });
});

describe('CU-03 Crear cotización: fechas', () => {
  test('CN-08 valor límite válido: el viaje empieza hoy', async () => {
    const r = await cotizar({ fecha_inicio: hoy, fecha_fin: sumarDias(hoy, 2) }, { producto: hotelVigente });
    assert.equal(r.status, 201);
  });
  test('CN-09 valor límite inválido: el viaje empieza ayer', async () => {
    const r = await cotizar({ fecha_inicio: sumarDias(hoy, -1), fecha_fin: sumarDias(hoy, 2) }, { producto: hotelVigente });
    assert.equal(r.status, 400);
    assert.match(r.mensaje, /anterior al día de hoy/);
  });
  test('CN-10 valor límite inválido: hotel con salida el mismo día (0 noches)', async () => {
    const r = await cotizar({ fecha_inicio: '2099-01-12', fecha_fin: '2099-01-12' });
    assert.equal(r.status, 400);
    assert.match(r.mensaje, /al menos 1 noche/);
  });
  test('CN-11 valor límite válido: hotel de 1 noche', async () => {
    const r = await cotizar({ fecha_inicio: '2099-01-12', fecha_fin: '2099-01-13' });
    assert.equal(r.status, 201);
  });
  test('CN-12 valor límite inválido: entrada un día antes de la disponibilidad', async () => {
    const r = await cotizar({ fecha_inicio: '2098-12-31', fecha_fin: '2099-01-02' });
    assert.equal(r.status, 400);
    assert.match(r.mensaje, /período de disponibilidad/);
  });
  test('CN-13 valor límite válido: entrada el primer día disponible', async () => {
    const r = await cotizar({ fecha_inicio: '2099-01-01', fecha_fin: '2099-01-02' });
    assert.equal(r.status, 201);
  });
  test('CN-14 valor límite válido: salida el día siguiente a la última noche', async () => {
    const r = await cotizar({ fecha_inicio: '2099-01-30', fecha_fin: '2099-02-01' });
    assert.equal(r.status, 201);
  });
  test('CN-15 valor límite inválido: salida dos días después de la última noche', async () => {
    const r = await cotizar({ fecha_inicio: '2099-01-30', fecha_fin: '2099-02-02' });
    assert.equal(r.status, 400);
  });
  test('CN-16 clase inválida: fecha con hora en lugar de día de calendario', async () => {
    const r = await cotizar({ fecha_inicio: '2099-01-12T10:00', fecha_fin: '2099-01-14' });
    assert.equal(r.status, 400);
    assert.match(r.mensaje, /formato válido/);
  });
});
