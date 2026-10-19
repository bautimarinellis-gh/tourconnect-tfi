const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Producto = require('../models/Producto');
const Cotizacion = require('../models/Cotizacion');
const productosController = require('../controllers/productosController');

const MAYORISTA = '64b000000000000000000001';

const ejecutar = async (handler, req) => {
  const r = { status: 200, body: null, error: null };
  const res = {
    status(code) { r.status = code; return this; },
    json(payload) { r.body = payload; return this; },
  };
  await handler({ usuario: { mayorista_id: MAYORISTA }, params: {}, ...req }, res, (e) => { r.error = e; });
  return r;
};

const productoValido = {
  tipo: 'paquete',
  nombre: 'Bariloche 7 noches',
  descripcion: 'Paquete completo',
  precio_base: 500,
  disponibilidad_desde: '2099-01-01',
  disponibilidad_hasta: '2099-12-31',
  cupo_maximo: 20,
  itinerario: 'Día 1...',
};

afterEach(() => mock.restoreAll());

describe('productos: solo se aceptan campos editables', () => {
  test('el alta descarta mayorista_id, cupo_lock_version y _id del body', async () => {
    const create = mock.method(Producto, 'create', async (data) => data);

    await ejecutar(productosController.createProducto, {
      body: {
        ...productoValido,
        mayorista_id: '64b0000000000000000000ff',
        cupo_lock_version: 999,
        _id: '64b0000000000000000000aa',
      },
    });

    const guardado = create.mock.calls[0].arguments[0];
    assert.equal(guardado.mayorista_id, MAYORISTA);
    assert.equal(guardado.cupo_lock_version, undefined);
    assert.equal(guardado._id, undefined);
    assert.equal(guardado.nombre, productoValido.nombre);
  });

  test('la edición descarta mayorista_id aunque venga en el body', async () => {
    mock.method(Producto, 'findById', async () => ({ ...productoValido, toObject: () => productoValido }));
    const update = mock.method(Producto, 'findByIdAndUpdate', async (_id, updates) => updates);

    await ejecutar(productosController.updateProducto, {
      params: { id: '64b000000000000000000010' },
      body: { nombre: 'Nuevo nombre', mayorista_id: '64b0000000000000000000ff', cupo_lock_version: 0 },
    });

    const aplicado = update.mock.calls[0].arguments[1];
    assert.deepEqual(aplicado, { nombre: 'Nuevo nombre' });
  });

  test('no se puede cambiar el tipo de un producto con cotizaciones', async () => {
    mock.method(Producto, 'findById', async () => ({ ...productoValido, toObject: () => productoValido }));
    mock.method(Cotizacion, 'countDocuments', async () => 2);
    const update = mock.method(Producto, 'findByIdAndUpdate', async () => null);

    const r = await ejecutar(productosController.updateProducto, {
      params: { id: '64b000000000000000000010' },
      body: { tipo: 'hotel', direccion: 'Calle 1', estrellas: 4 },
    });

    assert.equal(r.status, 409);
    assert.equal(update.mock.callCount(), 0);
  });
});
