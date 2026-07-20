/**
 * Tests unitarios de utils/dateRanges.js (rangos de disponibilidad).
 *
 * CAJA NEGRA — partición de equivalencia sobre rangos (posterior / mismo
 * día / anterior / entrada inválida) y valores límite (diferencia de
 * exactamente 0 y 1 día, que es donde decide isValidDateRange).
 *
 * CAJA BLANCA — cobertura de la opción allowSameDay y del tope maxEnd
 * de applyRangePreset.
 */
import { describe, test, expect } from 'vitest';
import {
  toDateInputValue,
  addDays,
  daysBetween,
  isValidDateRange,
  applyRangePreset,
} from './dateRanges';

describe('daysBetween — caja negra: partición de equivalencia', () => {
  test('rango posterior → días positivos', () => {
    expect(daysBetween('2026-07-01', '2026-07-31')).toBe(30);
  });

  test('rango invertido → días negativos', () => {
    expect(daysBetween('2026-07-31', '2026-07-01')).toBe(-30);
  });

  test('entrada inválida o vacía → null', () => {
    expect(daysBetween('', '2026-07-31')).toBe(null);
    expect(daysBetween('2026-07-01', 'no-es-fecha')).toBe(null);
  });

  test('cruza el límite de mes correctamente', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
  });
});

describe('isValidDateRange — caja negra: valores límite', () => {
  test('mismo día (0 días, frontera) → válido por defecto', () => {
    expect(isValidDateRange('2026-07-15', '2026-07-15')).toBe(true);
  });

  test('un día después (frontera +1) → válido', () => {
    expect(isValidDateRange('2026-07-15', '2026-07-16')).toBe(true);
  });

  test('un día antes (frontera −1) → inválido', () => {
    expect(isValidDateRange('2026-07-15', '2026-07-14')).toBe(false);
  });
});

describe('isValidDateRange — caja blanca: rama allowSameDay', () => {
  test('con allowSameDay: false el mismo día pasa a ser inválido', () => {
    expect(isValidDateRange('2026-07-15', '2026-07-15', { allowSameDay: false })).toBe(false);
    expect(isValidDateRange('2026-07-15', '2026-07-16', { allowSameDay: false })).toBe(true);
  });

  test('entrada inválida → false (rama days === null)', () => {
    expect(isValidDateRange('', '2026-07-15')).toBe(false);
  });
});

describe('addDays / toDateInputValue — caja negra', () => {
  test('suma días cruzando fin de mes', () => {
    expect(addDays('2026-07-30', 5)).toBe('2026-08-04');
  });

  test('entrada inválida → cadena vacía', () => {
    expect(addDays('', 5)).toBe('');
  });

  test('toDateInputValue recorta timestamps ISO a YYYY-MM-DD', () => {
    expect(toDateInputValue('2026-07-15T14:30:00.000Z')).toBe('2026-07-15');
    expect(toDateInputValue('')).toBe('');
  });
});

describe('applyRangePreset — caja blanca: cobertura de ramas', () => {
  test('rama days: suma días desde el inicio dado', () => {
    expect(applyRangePreset({ startInput: '2026-07-01', days: 30 }))
      .toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });

  test('rama months: suma meses calendario', () => {
    expect(applyRangePreset({ startInput: '2026-07-01', months: 6 }))
      .toEqual({ start: '2026-07-01', end: '2027-01-01' });
  });

  test('rama fallbackStart: sin inicio usa el fallback', () => {
    expect(applyRangePreset({ startInput: '', days: 10, fallbackStart: '2026-07-01' }))
      .toEqual({ start: '2026-07-01', end: '2026-07-11' });
  });

  test('rama maxEnd: recorta el final si excede el tope', () => {
    expect(applyRangePreset({ startInput: '2026-07-01', days: 90, maxEnd: '2026-07-31' }))
      .toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });
});
