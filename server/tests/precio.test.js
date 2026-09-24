const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { calcularPrecioCotizacion, calcularPrecioFinal } = require('../utils/precioCalculator');

const base = { precio_base: 100, markup_porcentaje: 10, pasajeros: 2 };

describe('calcularPrecioCotizacion', () => {
  test('hotel: precio por noche y por pasajero', () => {
    const r = calcularPrecioCotizacion({
      ...base, tipo: 'hotel',
      fecha_inicio: new Date('2026-12-10'), fecha_fin: new Date('2026-12-13'),
    });
    assert.deepEqual(r, { precio_unitario: 110, unidades: 3, precio_total: 660 });
  });

  test('hotel: exige al menos una noche', () => {
    assert.throws(() => calcularPrecioCotizacion({
      ...base, tipo: 'hotel',
      fecha_inicio: new Date('2026-12-10'), fecha_fin: new Date('2026-12-10'),
    }), /al menos 1/);
  });

  test('actividad: precio por pasajero, sin importar las fechas', () => {
    const r = calcularPrecioCotizacion({
      ...base, tipo: 'actividad',
      fecha_inicio: new Date('2026-12-10'), fecha_fin: new Date('2026-12-10'),
    });
    assert.deepEqual(r, { precio_unitario: 110, unidades: 1, precio_total: 220 });
  });

  test('paquete: precio por pasajero por el paquete completo (no multiplica noches)', () => {
    const r = calcularPrecioCotizacion({
      ...base, tipo: 'paquete',
      fecha_inicio: new Date('2026-12-10'), fecha_fin: new Date('2026-12-17'),
    });
    assert.deepEqual(r, { precio_unitario: 110, unidades: 1, precio_total: 220 });
  });

  test('el total es exactamente el unitario que ve la agencia multiplicado', () => {
    // 33.33 × 1.15 = 38.3295 → la agencia ve 38.33; 3 pax deben dar 114.99.
    const r = calcularPrecioCotizacion({
      tipo: 'actividad', precio_base: 33.33, markup_porcentaje: 15, pasajeros: 3,
      fecha_inicio: new Date('2026-12-10'), fecha_fin: new Date('2026-12-10'),
    });
    assert.equal(r.precio_unitario, calcularPrecioFinal(33.33, 15));
    assert.equal(r.precio_total, 114.99);
  });

  test('rechaza tipos desconocidos y pasajeros inválidos', () => {
    const fechas = { fecha_inicio: new Date('2026-12-10'), fecha_fin: new Date('2026-12-11') };
    assert.throws(() => calcularPrecioCotizacion({ ...base, ...fechas, tipo: 'crucero' }), /sin regla de precio/);
    assert.throws(() => calcularPrecioCotizacion({ ...base, ...fechas, tipo: 'hotel', pasajeros: 0 }), /pasajeros/);
    assert.throws(() => calcularPrecioCotizacion({ ...base, ...fechas, tipo: 'hotel', pasajeros: 1.5 }), /pasajeros/);
  });
});
