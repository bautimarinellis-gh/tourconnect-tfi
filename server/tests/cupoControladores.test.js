const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Producto = require('../models/Producto');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const AgenciaProducto = require('../models/AgenciaProducto');
const cotizacionController = require('../controllers/cotizacionController');
const productosController = require('../controllers/productosController');

const ejecutar = async (handler, req) => {
  const r = { status: 200, body: null, error: null };
  const res = {
    status(code) { r.status = code; return this; },
    json(payload) { r.body = payload; return this; },
  };
  await handler({ params: {}, query: {}, body: {}, ...req }, res, (e) => { r.error = e; });
  return r;
};

/** Cotización comprometida (reservada) como la devolvería la base. */
const reservada = (id, inicio, fin, pasajeros) => ({
  _id: id, estado: 'reserva_generada', pasajeros,
  fecha_inicio: new Date(`${inicio}T00:00:00Z`), fecha_fin: new Date(`${fin}T00:00:00Z`),
});

/** Simula la base: las cotizaciones comprometidas del producto y ninguna reserva cancelada. */
const conCompromisos = (compromisos) => {
  mock.method(Cotizacion, 'find', () => ({ session: async () => compromisos }));
  mock.method(Reserva, 'find', () => ({ session: () => ({ distinct: async () => [] }) }));
};

const hotel = {
  _id: 'p1', mayorista_id: 'm1', tipo: 'hotel', activo: true, precio_base: 100, cupo_maximo: 10,
  disponibilidad_desde: new Date('2099-01-01T00:00:00Z'), disponibilidad_hasta: new Date('2099-01-31T00:00:00Z'),
};

afterEach(() => mock.restoreAll());

describe('crear cotización: cupo y salida del hotel', () => {
  const pedir = async (body) => {
    mock.method(AgenciaProducto, 'findOne', () => ({
      populate: async () => ({ producto_id: hotel, markup_porcentaje: 10 }),
    }));
    const create = mock.method(Cotizacion, 'create', async (data) => data);
    const r = await ejecutar(cotizacionController.createCotizacion, {
      usuario: { agencia_id: 'a1' },
      body: { producto_id: 'p1', ...body },
    });
    return { ...r, creada: create.mock.callCount() > 0 };
  };

  test('se rechaza si los pasajeros superan las plazas libres', async () => {
    conCompromisos([reservada('c1', '2099-01-10', '2099-01-12', 8)]);
    const r = await pedir({ fecha_inicio: '2099-01-11', fecha_fin: '2099-01-13', pasajeros: 3 });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /quedan 2 de 10/);
    assert.equal(r.creada, false);
  });

  test('una estadía que no se pisa con otra no consume su cupo', async () => {
    conCompromisos([reservada('c1', '2099-01-10', '2099-01-12', 8)]);
    const r = await pedir({ fecha_inicio: '2099-01-12', fecha_fin: '2099-01-14', pasajeros: 10 });
    assert.equal(r.status, 201);
    assert.equal(r.creada, true);
  });

  test('la salida puede ser el día siguiente a la última noche disponible', async () => {
    conCompromisos([]);
    const r = await pedir({ fecha_inicio: '2099-01-30', fecha_fin: '2099-02-01', pasajeros: 2 });
    assert.equal(r.status, 201);
  });

  test('la salida no puede pasar del día siguiente a la última noche', async () => {
    conCompromisos([]);
    const r = await pedir({ fecha_inicio: '2099-01-30', fecha_fin: '2099-02-02', pasajeros: 2 });
    assert.equal(r.status, 400);
    assert.equal(r.creada, false);
  });
});

describe('editar producto: no se deja afuera lo ya vendido', () => {
  const existente = {
    ...hotel,
    nombre: 'Hotel', descripcion: 'x', direccion: 'Calle 1', estrellas: 4,
    toObject() { return { ...this }; },
  };

  test('no se puede bajar el cupo por debajo de lo comprometido', async () => {
    mock.method(Producto, 'findById', async () => existente);
    conCompromisos([reservada('c1', '2099-01-10', '2099-01-12', 8)]);
    const update = mock.method(Producto, 'findByIdAndUpdate', async () => existente);

    const r = await ejecutar(productosController.updateProducto, { params: { id: 'p1' }, body: { cupo_maximo: 5 } });

    assert.equal(r.status, 409);
    assert.match(r.body.message, /8 plazas comprometidas el 10\/01\/2099/);
    assert.equal(update.mock.callCount(), 0);
  });

  test('se puede bajar el cupo si sigue cubriendo lo comprometido', async () => {
    mock.method(Producto, 'findById', async () => existente);
    conCompromisos([reservada('c1', '2099-01-10', '2099-01-12', 8)]);
    mock.method(Producto, 'findByIdAndUpdate', async () => existente);

    const r = await ejecutar(productosController.updateProducto, { params: { id: 'p1' }, body: { cupo_maximo: 8 } });
    assert.equal(r.status, 200);
  });

  test('no se puede achicar la disponibilidad si quedan ventas afuera', async () => {
    mock.method(Producto, 'findById', async () => existente);
    conCompromisos([reservada('c1', '2099-01-25', '2099-01-28', 2)]);
    const update = mock.method(Producto, 'findByIdAndUpdate', async () => existente);

    const r = await ejecutar(productosController.updateProducto, {
      params: { id: 'p1' },
      body: { disponibilidad_hasta: '2099-01-20' },
    });

    assert.equal(r.status, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  test('un producto viejo sin cupo se puede editar sin definirlo', async () => {
    const sinCupo = { ...existente, cupo_maximo: undefined, toObject() { return { ...this }; } };
    mock.method(Producto, 'findById', async () => sinCupo);
    mock.method(Producto, 'findByIdAndUpdate', async () => sinCupo);

    const r = await ejecutar(productosController.updateProducto, { params: { id: 'p1' }, body: { nombre: 'Otro' } });
    assert.equal(r.status, 200);
  });

  test('el alta exige cupo para cualquier tipo', async () => {
    const create = mock.method(Producto, 'create', async (d) => d);
    const r = await ejecutar(productosController.createProducto, {
      usuario: { mayorista_id: 'm1' },
      body: {
        tipo: 'hotel', nombre: 'H', descripcion: 'x', precio_base: 10, direccion: 'C', estrellas: 3,
        disponibilidad_desde: '2099-01-01', disponibilidad_hasta: '2099-02-01',
      },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /cupo/i);
    assert.equal(create.mock.callCount(), 0);
  });
});

describe('catálogo de la agencia', () => {
  test('solo pide productos activos con disponibilidad vigente', async () => {
    let match;
    mock.method(AgenciaProducto, 'find', () => ({
      populate: async (opts) => { match = opts.match; return []; },
    }));

    await ejecutar(productosController.getProductos, { usuario: { rol: 'agencia', agencia_id: 'a1' } });

    assert.equal(match.activo, true);
    assert.ok(match.disponibilidad_hasta.$gte instanceof Date);
  });
});
