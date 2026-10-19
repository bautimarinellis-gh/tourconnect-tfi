import { describe, expect, test } from 'vitest';
import { formatFecha, formatRangoFechas } from './formatters';

// Las fechas de viaje se guardan como medianoche UTC del día elegido. En
// Argentina (UTC-3) esa medianoche es el día anterior a las 21 hs: formatearla
// en hora local mostraría un día menos.
describe('formatFecha', () => {
  test('muestra el día elegido, sin correrse por la zona horaria', () => {
    expect(formatFecha('2026-12-10T00:00:00.000Z')).toBe('Dec 10, 2026');
  });

  test('vacío si no hay fecha', () => {
    expect(formatFecha(null)).toBe('');
  });
});

describe('formatRangoFechas', () => {
  test('una actividad (inicio = fin) se muestra como un solo día', () => {
    expect(formatRangoFechas('2026-12-10T00:00:00.000Z', '2026-12-10T00:00:00.000Z')).toBe('Dec 10, 2026');
  });

  test('un rango muestra ambas fechas', () => {
    expect(formatRangoFechas('2026-12-10T00:00:00.000Z', '2026-12-13T00:00:00.000Z', ' al '))
      .toBe('Dec 10, 2026 al Dec 13, 2026');
  });
});
