/**
 * Tests unitarios de utils/telefono.js (máscara de teléfono).
 *
 * CAJA NEGRA — partición de equivalencia: solo dígitos / con letras /
 * con "+" inicial / vacío. Valores límite sobre el tope de 15 dígitos.
 *
 * CAJA BLANCA — cobertura de la rama que conserva el "+" solo si es inicial.
 */
import { describe, test, expect } from 'vitest';
import { formatTelefono } from './telefono';

describe('formatTelefono — caja negra: partición de equivalencia', () => {
  test('clase válida: solo dígitos → pasa sin cambios', () => {
    expect(formatTelefono('1122334455')).toBe('1122334455');
  });

  test('clase con ruido: descarta letras y símbolos', () => {
    expect(formatTelefono('11abc2233')).toBe('112233');
    expect(formatTelefono('11-2233-4455')).toBe('1122334455');
    expect(formatTelefono('(11) 2233 4455')).toBe('1122334455');
  });

  test('entrada vacía → cadena vacía', () => {
    expect(formatTelefono('')).toBe('');
  });
});

describe('formatTelefono — caja negra: valores límite (tope 15 dígitos)', () => {
  test('15 dígitos (exacto) → completo', () => {
    expect(formatTelefono('123456789012345')).toBe('123456789012345');
  });

  test('16 dígitos (uno más) → recorta a 15', () => {
    expect(formatTelefono('1234567890123456')).toBe('123456789012345');
  });
});

describe('formatTelefono — caja blanca: rama del "+" inicial', () => {
  test('conserva el "+" solo si está al inicio', () => {
    expect(formatTelefono('+541122334455')).toBe('+541122334455');
  });

  test('un "+" en el medio se descarta como símbolo', () => {
    expect(formatTelefono('54+1122334455')).toBe('541122334455');
  });

  test('el "+" inicial sobrevive aunque haya espacios antes', () => {
    expect(formatTelefono('  +54 11 2233')).toBe('+54112233');
  });
});
