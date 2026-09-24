const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { calcularVencimiento, estaVigente, horasVigencia } = require('../utils/vigenciaCotizacion');
const { contarPasajerosComprometidos } = require('../utils/cupoValidator');

const HORA = 60 * 60 * 1000;
const ahora = new Date('2026-09-24T15:00:00Z');
const haceHoras = (h) => new Date(ahora.getTime() - h * HORA);

let envOriginal;
beforeEach(() => { envOriginal = process.env.COTIZACION_EXPIRA_HORAS; delete process.env.COTIZACION_EXPIRA_HORAS; });
afterEach(() => {
  if (envOriginal === undefined) delete process.env.COTIZACION_EXPIRA_HORAS;
  else process.env.COTIZACION_EXPIRA_HORAS = envOriginal;
});

describe('vigencia de cotizaciones', () => {
  test('por defecto son 72 horas y se puede configurar por entorno', () => {
    assert.equal(horasVigencia(), 72);
    process.env.COTIZACION_EXPIRA_HORAS = '24';
    assert.equal(horasVigencia(), 24);
    process.env.COTIZACION_EXPIRA_HORAS = 'no-numero';
    assert.equal(horasVigencia(), 72);
  });

  test('una pendiente vence 72 h después de creada', () => {
    const cot = { estado: 'pendiente', created_at: haceHoras(10) };
    assert.deepEqual(calcularVencimiento(cot), new Date(haceHoras(10).getTime() + 72 * HORA));
    assert.equal(estaVigente(cot, ahora), true);
    assert.equal(estaVigente({ estado: 'pendiente', created_at: haceHoras(73) }, ahora), false);
  });

  test('una aprobada vence 72 h después de la aprobación', () => {
    const viajeLejano = new Date('2026-12-01T00:00:00Z');
    assert.equal(estaVigente({ estado: 'aprobada', aprobada_at: haceHoras(71), fecha_inicio: viajeLejano }, ahora), true);
    assert.equal(estaVigente({ estado: 'aprobada', aprobada_at: haceHoras(73), fecha_inicio: viajeLejano }, ahora), false);
  });

  test('una aprobada sin aprobada_at (dato previo) usa updated_at', () => {
    const cot = { estado: 'aprobada', aprobada_at: null, updated_at: haceHoras(80), fecha_inicio: new Date('2026-12-01') };
    assert.equal(estaVigente(cot, ahora), false);
  });

  test('una aprobada no puede reservarse después del día de inicio del viaje', () => {
    const cot = { estado: 'aprobada', aprobada_at: haceHoras(1), fecha_inicio: new Date('2026-09-23T00:00:00Z') };
    assert.equal(estaVigente(cot, ahora), false);
  });

  test('los estados finales no vencen', () => {
    for (const estado of ['reserva_generada', 'rechazada', 'cancelada', 'vencida']) {
      assert.equal(calcularVencimiento({ estado, created_at: haceHoras(500) }), null);
      assert.equal(estaVigente({ estado, created_at: haceHoras(500) }, ahora), true);
    }
  });
});

describe('contarPasajerosComprometidos', () => {
  const viaje = new Date('2026-12-01T00:00:00Z');
  const aprobada = (id, pasajeros, horas = 1) => ({ _id: id, estado: 'aprobada', pasajeros, aprobada_at: haceHoras(horas), fecha_inicio: viaje });
  const reservada = (id, pasajeros) => ({ _id: id, estado: 'reserva_generada', pasajeros });

  test('suma aprobadas vigentes y reservas activas', () => {
    const total = contarPasajerosComprometidos([aprobada('a', 3), reservada('b', 4)], new Set(), ahora);
    assert.equal(total, 7);
  });

  test('una reserva cancelada libera su cupo', () => {
    const total = contarPasajerosComprometidos([reservada('b', 4), reservada('c', 5)], new Set(['c']), ahora);
    assert.equal(total, 4);
  });

  test('una aprobada que venció sin reservarse libera su cupo', () => {
    const total = contarPasajerosComprometidos([aprobada('a', 3, 100), aprobada('d', 2)], new Set(), ahora);
    assert.equal(total, 2);
  });
});
