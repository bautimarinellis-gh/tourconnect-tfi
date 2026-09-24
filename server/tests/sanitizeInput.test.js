const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');

// Aislar el middleware de la base: el intento se audita, pero en el test
// alcanza con saber que se llamó.
const auditService = require('../utils/auditService');
const registrarAuditoria = mock.method(auditService, 'registrarAuditoria', () => {});

const { sanitizeInput, buscarClaveProhibida } = require('../middlewares/sanitizeInput');

/** Corre el middleware y devuelve { status, body, siguio }. */
const correr = (req) => {
  const resultado = { status: null, body: null, siguio: false };
  const res = {
    status(code) { resultado.status = code; return this; },
    json(body) { resultado.body = body; return this; },
  };
  sanitizeInput({ body: {}, query: {}, params: {}, method: 'POST', originalUrl: '/x', headers: {}, ...req }, res, () => {
    resultado.siguio = true;
  });
  return resultado;
};

describe('buscarClaveProhibida', () => {
  test('acepta valores planos, arrays y objetos anidados sin operadores', () => {
    assert.equal(buscarClaveProhibida({ email: 'a@b.com', password: 'x' }), null);
    assert.equal(buscarClaveProhibida({ productos: [{ producto_id: '1', markup_porcentaje: 10 }] }), null);
    assert.equal(buscarClaveProhibida({ estado: 'pendiente' }), null);
    assert.equal(buscarClaveProhibida(undefined), null);
  });

  test('detecta operadores en cualquier nivel', () => {
    assert.equal(buscarClaveProhibida({ invite_token: { $ne: null } }), 'invite_token.$ne');
    assert.equal(buscarClaveProhibida({ $where: '1' }), '$where');
    assert.equal(buscarClaveProhibida({ productos: [{ producto_id: { $gt: '' } }] }), 'productos[0].producto_id.$gt');
  });

  test('detecta claves con punto (acceso a subdocumentos)', () => {
    assert.equal(buscarClaveProhibida({ 'usuario.rol': 'admin' }), 'usuario.rol');
  });
});

describe('sanitizeInput', () => {
  test('deja pasar una request normal', () => {
    const r = correr({ body: { email: 'a@b.com', password: 'secreto123' }, query: { estado: 'pendiente' } });
    assert.equal(r.siguio, true);
    assert.equal(r.status, null);
  });

  test('rechaza el intento de tomar una cuenta con invite_token: {$ne: null}', () => {
    const antes = registrarAuditoria.mock.callCount();
    const r = correr({ body: { invite_token: { $ne: null }, password: 'nueva12345' } });
    assert.equal(r.siguio, false);
    assert.equal(r.status, 400);
    assert.equal(r.body.success, false);
    assert.equal(registrarAuditoria.mock.callCount(), antes + 1);
    const [{ accion, detalle }] = registrarAuditoria.mock.calls.at(-1).arguments;
    assert.equal(accion, 'ACCESO_DENEGADO');
    assert.equal(detalle.clave, 'invite_token.$ne');
  });

  test('rechaza operadores en la query string (?estado[$ne]=x)', () => {
    const r = correr({ method: 'GET', query: { estado: { $ne: 'x' } } });
    assert.equal(r.siguio, false);
    assert.equal(r.status, 400);
  });
});
