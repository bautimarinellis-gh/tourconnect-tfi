const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Antes de requerir el controller: toma la referencia al cargarse.
const mailer = require('../utils/mailer');
const enviarInvitacion = mock.method(mailer, 'enviarInvitacion', async () => {});

const Mayorista = require('../models/Mayorista');
const Usuario = require('../models/Usuario');
const adminController = require('../controllers/adminController');

const ejecutar = async (req) => {
  const r = { status: 200, body: null, error: null };
  const res = {
    status(code) { r.status = code; return this; },
    json(payload) { r.body = payload; return this; },
  };
  await adminController.reenviarInvitacionMayorista({ params: { id: 'm1' }, ...req }, res, (e) => { r.error = e; });
  return r;
};

const usuarioFalso = (datos) => {
  const u = { email: 'mayo@test.com', save: async () => u, ...datos };
  return { select: async () => u, usuario: u };
};

afterEach(() => {
  mock.restoreAll();
  enviarInvitacion.mock.resetCalls();
});

describe('reenviar invitación a un mayorista', () => {
  test('genera un token nuevo y manda el email si la invitación está pendiente', async () => {
    mock.method(Mayorista, 'findById', async () => ({ activo: true, usuario_id: 'u1' }));
    const { select, usuario } = usuarioFalso({ password_hash: undefined, invite_token: 'viejo' });
    mock.method(Usuario, 'findById', () => ({ select }));

    const r = await ejecutar({});

    assert.equal(r.status, 200);
    assert.notEqual(usuario.invite_token, 'viejo');
    assert.ok(usuario.invite_token_expires > new Date());
    assert.equal(enviarInvitacion.mock.callCount(), 1);
  });

  test('no aplica si el usuario ya definió su contraseña', async () => {
    mock.method(Mayorista, 'findById', async () => ({ activo: true, usuario_id: 'u1' }));
    const { select } = usuarioFalso({ password_hash: 'hash' });
    mock.method(Usuario, 'findById', () => ({ select }));

    const r = await ejecutar({});

    assert.equal(r.status, 400);
    assert.equal(enviarInvitacion.mock.callCount(), 0);
  });

  test('no aplica a un mayorista desactivado (se reactiva por su propio flujo)', async () => {
    mock.method(Mayorista, 'findById', async () => ({ activo: false, usuario_id: 'u1' }));

    const r = await ejecutar({});

    assert.equal(r.status, 400);
    assert.equal(enviarInvitacion.mock.callCount(), 0);
  });
});
