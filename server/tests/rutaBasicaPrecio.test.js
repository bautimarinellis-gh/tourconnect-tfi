// Prueba de unidad de caja blanca (ruta básica) sobre calcularPrecioCotizacion.
// Cada caso recorre una de las 6 rutas independientes del grafo de flujo
// (complejidad ciclomática V(G) = 6) documentado en el anexo de Pruebas.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { calcularPrecioCotizacion } = require('../utils/precioCalculator');

const base = { precio_base: 100, markup_porcentaje: 10, pasajeros: 2 };
const fechas = (inicio, fin) => ({ fecha_inicio: new Date(inicio), fecha_fin: new Date(fin) });

describe('ruta básica de calcularPrecioCotizacion', () => {
  test('R1 (1-2-10): tipo de producto sin regla de precio', () => {
    assert.throws(
      () => calcularPrecioCotizacion({ ...base, ...fechas('2099-01-10', '2099-01-11'), tipo: 'crucero' }),
      /sin regla de precio/
    );
  });

  test('R2 (1-3-5-10): pasajeros no enteros', () => {
    assert.throws(
      () => calcularPrecioCotizacion({ ...base, ...fechas('2099-01-10', '2099-01-11'), tipo: 'hotel', pasajeros: 1.5 }),
      /pasajeros/
    );
  });

  test('R3 (1-3-4-5-10): pasajeros enteros menores que 1', () => {
    assert.throws(
      () => calcularPrecioCotizacion({ ...base, ...fechas('2099-01-10', '2099-01-11'), tipo: 'hotel', pasajeros: 0 }),
      /pasajeros/
    );
  });

  test('R4 (1-3-4-6-9-10): actividad, sin contar noches', () => {
    const r = calcularPrecioCotizacion({ ...base, ...fechas('2099-01-10', '2099-01-10'), tipo: 'actividad' });
    assert.deepEqual(r, { precio_unitario: 110, unidades: 1, precio_total: 220 });
  });

  test('R5 (1-3-4-6-7-8-10): hotel con cero noches', () => {
    assert.throws(
      () => calcularPrecioCotizacion({ ...base, ...fechas('2099-01-10', '2099-01-10'), tipo: 'hotel' }),
      /al menos 1/
    );
  });

  test('R6 (1-3-4-6-7-9-10): hotel de 3 noches para 2 pasajeros', () => {
    const r = calcularPrecioCotizacion({ ...base, ...fechas('2099-01-10', '2099-01-13'), tipo: 'hotel' });
    assert.deepEqual(r, { precio_unitario: 110, unidades: 3, precio_total: 660 });
  });
});
