import { describe, expect, test } from 'vitest';
import { estimarPrecio, esDeUnSoloDia, etiquetaPrecio } from './precio';

// Mismos casos que server/tests/precio.test.js: el estimado que ve la agencia
// tiene que coincidir con lo que después calcula el servidor.
describe('estimarPrecio', () => {
  const base = { precioUnitario: 110, pasajeros: 2 };

  test('hotel: por noche y por pasajero', () => {
    expect(estimarPrecio({ ...base, tipo: 'hotel', fechaInicio: '2026-12-10', fechaFin: '2026-12-13' }))
      .toEqual({ total: 660, noches: 3 });
  });

  test('hotel: sin noches no hay estimado', () => {
    expect(estimarPrecio({ ...base, tipo: 'hotel', fechaInicio: '2026-12-10', fechaFin: '2026-12-10' })).toBeNull();
  });

  test('actividad: por pasajero, alcanza con la fecha de inicio', () => {
    expect(estimarPrecio({ ...base, tipo: 'actividad', fechaInicio: '2026-12-10', fechaFin: '' }))
      .toEqual({ total: 220, noches: null });
  });

  test('paquete: por pasajero, no multiplica noches', () => {
    expect(estimarPrecio({ ...base, tipo: 'paquete', fechaInicio: '2026-12-10', fechaFin: '2026-12-17' }))
      .toEqual({ total: 220, noches: null });
  });

  test('paquete: necesita un rango válido', () => {
    expect(estimarPrecio({ ...base, tipo: 'paquete', fechaInicio: '2026-12-10', fechaFin: '2026-12-10' })).toBeNull();
  });
});

describe('etiquetas', () => {
  test('cada tipo explica su unidad de precio', () => {
    expect(etiquetaPrecio('hotel')).toBe('Precio por noche por pasajero');
    expect(etiquetaPrecio('actividad')).toBe('Precio por pasajero');
    expect(esDeUnSoloDia('actividad')).toBe(true);
    expect(esDeUnSoloDia('hotel')).toBe(false);
  });
});
