/**
 * Tests de utils/cuit.js — máscara y validación de CUIT argentino.
 *
 * Cada test verifica UNA sola cosa: le doy una entrada, comparo la salida
 * contra lo que espero. Si algún día `cuit.js` cambia y deja de cumplir
 * esto, el test correspondiente se pone en rojo.
 */
import { describe, test, expect } from 'vitest';
import { formatCuit, isValidCuit } from './cuit';

describe('isValidCuit', () => {
  // Caja negra — partición de equivalencia: un caso por cada tipo de valor
  test('acepta un CUIT con el formato correcto', () => {
    expect(isValidCuit('20-12345678-9')).toBe(true);
  });

  test('rechaza un CUIT con letras', () => {
    expect(isValidCuit('20-abcdefgh-9')).toBe(false);
  });

  test('rechaza un CUIT sin los guiones', () => {
    expect(isValidCuit('20123456789')).toBe(false);
  });

  test('rechaza un valor vacío', () => {
    expect(isValidCuit('')).toBe(false);
  });

  // Caja negra — valores límite: la frontera es "exactamente 11 dígitos"
  test('rechaza si falta un dígito (10 en vez de 11)', () => {
    expect(isValidCuit('20-1234567-9')).toBe(false);
  });

  test('rechaza si sobra un dígito (12 en vez de 11)', () => {
    expect(isValidCuit('20-123456789-9')).toBe(false);
  });
});

describe('formatCuit', () => {
  // Caja blanca — cada test cubre una rama distinta de la función
  test('con 2 dígitos o menos, todavía no pone guiones', () => {
    expect(formatCuit('20')).toBe('20');
  });

  test('con menos de 11 dígitos, pone el primer guion', () => {
    expect(formatCuit('201234')).toBe('20-1234');
  });

  test('con los 11 dígitos completos, pone los dos guiones', () => {
    expect(formatCuit('20123456789')).toBe('20-12345678-9');
  });

  test('si escriben más de 11 dígitos, descarta el resto', () => {
    expect(formatCuit('201234567890000')).toBe('20-12345678-9');
  });

  // Caja negra — la función debe "limpiar" cualquier entrada rara
  test('ignora letras y símbolos, se queda solo con los números', () => {
    expect(formatCuit('20.abc.12345678.9')).toBe('20-12345678-9');
  });
});
