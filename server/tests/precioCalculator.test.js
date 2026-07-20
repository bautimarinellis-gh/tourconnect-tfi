// Tests de utils/precioCalculator.js
//
// Un test = "le doy esta entrada a la función, y afirmo (assert) que la
// salida tiene que ser tal cosa". Si algún día la función cambia y deja
// de cumplirlo, este archivo lo va a marcar en rojo.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calcularPrecioFinal, calcularPrecioTotal } = require('../utils/precioCalculator');

describe('calcularPrecioFinal', () => {
  test('suma el markup al precio base', () => {
    // 100 + 10% de markup = 110
    assert.equal(calcularPrecioFinal(100, 10), 110);
  });

  test('rechaza valores negativos', () => {
    // assert.throws espera que la función tire un error (no un valor).
    // La función valida esto internamente con un "if (... < 0) throw ...".
    assert.throws(() => calcularPrecioFinal(-100, 10));
  });

  test('redondea a 2 decimales', () => {
    // 33.33 * 1.10 = 36.663 → la función lo redondea a 36.66
    assert.equal(calcularPrecioFinal(33.33, 10), 36.66);
  });
});

describe('calcularPrecioTotal', () => {
  test('multiplica precio, markup, noches y pasajeros', () => {
    // 100 con 10% de markup = 110 por noche/pasajero
    // 110 × 3 noches × 2 pasajeros = 660
    assert.equal(calcularPrecioTotal(100, 10, 3, 2), 660);
  });

  test('exige al menos 1 noche y 1 pasajero', () => {
    assert.throws(() => calcularPrecioTotal(100, 10, 0, 1)); // 0 noches → error
    assert.throws(() => calcularPrecioTotal(100, 10, 1, 0)); // 0 pasajeros → error
  });
});
