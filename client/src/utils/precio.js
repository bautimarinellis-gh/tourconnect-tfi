import { daysBetween } from './dateRanges';

/**
 * Regla de precio por tipo de producto. Espejo de MODALIDAD_POR_TIPO en
 * server/utils/precioCalculator.js: acá solo se usa para mostrar el estimado
 * y las etiquetas; el precio que vale es el que calcula el servidor.
 *
 *  - hotel:     por noche y por pasajero → precio × noches × pasajeros
 *  - actividad: por pasajero, un solo día → precio × pasajeros
 *  - paquete:   por pasajero, el paquete completo → precio × pasajeros
 */
const ETIQUETA_PRECIO = {
  hotel: 'Precio por noche por pasajero',
  actividad: 'Precio por pasajero',
  paquete: 'Precio por pasajero (paquete completo)',
};

export const cobraPorNoche = (tipo) => tipo === 'hotel';

/** Las actividades se cotizan para un solo día. */
export const esDeUnSoloDia = (tipo) => tipo === 'actividad';

export const etiquetaPrecio = (tipo) => ETIQUETA_PRECIO[tipo] ?? 'Precio';

/**
 * Total estimado de una cotización y su desglose, o null si faltan datos.
 * @returns {{ total: number, noches: number|null } | null}
 */
export const estimarPrecio = ({ tipo, precioUnitario, fechaInicio, fechaFin, pasajeros }) => {
  if (!precioUnitario || !fechaInicio || pasajeros < 1) return null;

  if (cobraPorNoche(tipo)) {
    if (!fechaFin) return null;
    const noches = daysBetween(fechaInicio, fechaFin);
    if (noches < 1) return null;
    return { total: round2(precioUnitario * noches * pasajeros), noches };
  }

  if (!esDeUnSoloDia(tipo) && (!fechaFin || fechaFin <= fechaInicio)) return null;
  return { total: round2(precioUnitario * pasajeros), noches: null };
};

const round2 = (n) => Number(n.toFixed(2));
