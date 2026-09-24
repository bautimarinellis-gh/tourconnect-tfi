const { test, describe, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const auditService = require('../utils/auditService');
mock.method(auditService, 'registrarAuditoria', async () => {});

const Usuario = require('../models/Usuario');
const authController = require('../controllers/authController');

/** Ejecuta un handler de Express y devuelve { status, body, error }. */
const ejecutar = async (handler, body) => {
  const resultado = { status: 200, body: null, error: null };
  const res = {
    status(code) { resultado.status = code; return this; },
    json(payload) { resultado.body = payload; return this; },
    cookie() { return this; },
  };
  await handler({ body, headers: {}, cookies: {} }, res, (err) => { resultado.error = err; });
  return resultado;
};

// Ningún test debería llegar a la base: si un operador pasara la validación,
// findOne se llamaría con él y el test lo detecta.
let findOne;
beforeEach(() => {
  findOne?.mock.restore();
  findOne = mock.method(Usuario, 'findOne', () => {
    throw new Error('findOne no debería ejecutarse con un filtro inválido');
  });
});

describe('authController: los operadores de Mongo no llegan a los filtros', () => {
  const casos = [
    ['setPassword', { invite_token: { $ne: null }, password: 'nueva12345' }],
    ['resetPassword', { token: { $ne: null }, password: 'nueva12345' }],
    ['login', { email: { $ne: null }, password: 'cualquiera' }],
    ['login', { email: 'a@b.com', password: { $gt: '' } }],
    ['forgotPassword', { email: { $regex: '.*' } }],
    ['verifyResetCode', { email: { $ne: null }, codigo: '123456' }],
    ['verifyResetCode', { email: 'a@b.com', codigo: { $ne: null } }],
  ];

  for (const [handler, body] of casos) {
    test(`${handler} rechaza ${JSON.stringify(body)}`, async () => {
      const r = await ejecutar(authController[handler], body);
      assert.equal(r.error, null);
      assert.equal(r.status, 400);
      assert.equal(r.body.success, false);
      assert.equal(findOne.mock.callCount(), 0);
    });
  }
});

describe('authController: normalización de email', () => {
  test('forgotPassword busca el email en minúsculas y sin espacios', async () => {
    findOne.mock.restore();
    findOne = mock.method(Usuario, 'findOne', async () => null);

    const r = await ejecutar(authController.forgotPassword, { email: '  Ana@Mail.COM ' });
    assert.equal(r.status, 200);
    assert.deepEqual(findOne.mock.calls[0].arguments[0], { email: 'ana@mail.com' });
  });
});
