const { test, describe, mock, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-test';

const Usuario = require('../models/Usuario');
const TokenRevocado = require('../models/TokenRevocado');
const auth = require('../middlewares/authMiddleware');
const { revocarToken } = require('../utils/sesion');

const USUARIO_ID = '64b000000000000000000009';

/** Corre los pre('save') del modelo sobre un documento, sin base de datos. */
const correrHooksDeSave = (doc) =>
  new Promise((resolve, reject) => {
    Usuario.schema.s.hooks.execPre('save', doc, [], (err) => (err ? reject(err) : resolve()));
  });

const usuarioExistente = (datos = {}) => {
  const doc = new Usuario({ email: 'a@b.com', rol: 'admin', activo: true, sesion_version: 3, ...datos });
  doc.isNew = false; // simula un documento ya guardado
  return doc;
};

describe('sesion_version sube cuando corresponde', () => {
  test('al cambiar la contraseña', async () => {
    const doc = usuarioExistente();
    doc.password_hash = 'hash-nuevo';
    await correrHooksDeSave(doc);
    assert.equal(doc.sesion_version, 4);
  });

  test('al desactivar la cuenta', async () => {
    const doc = usuarioExistente();
    doc.activo = false;
    await correrHooksDeSave(doc);
    assert.equal(doc.sesion_version, 4);
  });

  test('no cambia con otras modificaciones (ej. nombre)', async () => {
    const doc = usuarioExistente();
    doc.nombre = 'Otro nombre';
    await correrHooksDeSave(doc);
    assert.equal(doc.sesion_version, 3);
  });
});

describe('authMiddleware', () => {
  let versionEnBase;
  let revocados;

  before(() => {
    // findById(...).select(...).populate(...).populate(...) → usuario admin
    mock.method(Usuario, 'findById', () => {
      const q = {
        select: () => q,
        populate: () => q,
        then: (ok) => Promise.resolve({ _id: USUARIO_ID, activo: true, rol: 'admin', rol_id: null, permisos_individuales: [], sesion_version: versionEnBase }).then(ok),
      };
      return q;
    });
    mock.method(TokenRevocado, 'exists', async ({ token_hash }) => (revocados.has(token_hash) ? { _id: 1 } : null));
    mock.method(TokenRevocado, 'updateOne', async ({ token_hash }) => { revocados.add(token_hash); });
  });

  afterEach(() => { revocados = new Set(); });

  const firmar = (sv) => jwt.sign({ id: USUARIO_ID, rol: 'admin', sv }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const pasar = async (token) => {
    const r = { status: 200, siguio: false };
    const res = { status(c) { r.status = c; return this; }, json() { return this; } };
    await auth({ cookies: { token } }, res, (err) => { if (err) throw err; r.siguio = true; });
    return r;
  };

  test('acepta un token con la versión vigente', async () => {
    versionEnBase = 2;
    revocados = new Set();
    assert.equal((await pasar(firmar(2))).siguio, true);
  });

  test('rechaza un token emitido antes de un cambio de contraseña', async () => {
    versionEnBase = 3;
    const r = await pasar(firmar(2));
    assert.equal(r.siguio, false);
    assert.equal(r.status, 401);
  });

  test('los tokens previos a este cambio (sin claim sv) valen mientras la versión sea 0', async () => {
    versionEnBase = 0;
    const token = jwt.sign({ id: USUARIO_ID, rol: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.equal((await pasar(token)).siguio, true);
  });

  test('un token cerrado con logout queda rechazado', async () => {
    versionEnBase = 0;
    const token = firmar(0);
    await revocarToken(token);
    const r = await pasar(token);
    assert.equal(r.siguio, false);
    assert.equal(r.status, 401);
  });
});
