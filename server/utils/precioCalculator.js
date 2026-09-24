/**
 * Calcula el precio final de un producto sumando un porcentaje de markup al precio base.
 * @param {number} precio_base El precio base del producto
 * @param {number} markup_porcentaje El porcentaje de ganancia a aplicar
 * @returns {number} El precio final redondeado a 2 decimales
 */
const calcularPrecioFinal = (precio_base, markup_porcentaje) => {
  if (typeof precio_base !== 'number' || typeof markup_porcentaje !== 'number') {
    throw new Error('El precio base y el porcentaje de markup deben ser numéricos');
  }

  if (precio_base < 0 || markup_porcentaje < 0) {
    throw new Error('El precio base y el porcentaje de markup deben ser números positivos');
  }

  const precioFinal = precio_base * (1 + markup_porcentaje / 100);
  return Number(precioFinal.toFixed(2));
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Qué representa el precio base según el tipo de producto:
 *  - hotel:     por noche y por pasajero → total = precio × noches × pasajeros
 *  - actividad: por pasajero, un solo día → total = precio × pasajeros
 *  - paquete:   por pasajero, el paquete completo → total = precio × pasajeros
 *
 * El frontend replica esta tabla en client/src/utils/precio.js solo para
 * mostrar el estimado; el precio que vale es el que calcula el servidor.
 */
const MODALIDAD_POR_TIPO = Object.freeze({
  hotel: 'por_noche_pasajero',
  actividad: 'por_pasajero',
  paquete: 'por_pasajero',
});

/** Noches entre dos fechas (días calendario, redondeado). */
const contarNoches = (fechaInicio, fechaFin) =>
  Math.round((new Date(fechaFin) - new Date(fechaInicio)) / MS_POR_DIA);

/**
 * Calcula el precio de una cotización según el tipo de producto.
 *
 * Devuelve también el precio unitario y las unidades cobradas, que la
 * cotización guarda como registro de cómo se calculó el total (CU-03, paso 10).
 *
 * @param {object} p
 * @param {'hotel'|'actividad'|'paquete'} p.tipo
 * @param {number} p.precio_base
 * @param {number} p.markup_porcentaje
 * @param {Date|string} p.fecha_inicio
 * @param {Date|string} p.fecha_fin
 * @param {number} p.pasajeros
 * @returns {{ precio_unitario: number, unidades: number, precio_total: number }}
 *   `unidades` son las noches en un hotel y 1 en actividades y paquetes.
 */
const calcularPrecioCotizacion = ({ tipo, precio_base, markup_porcentaje, fecha_inicio, fecha_fin, pasajeros }) => {
  const modalidad = MODALIDAD_POR_TIPO[tipo];
  if (!modalidad) {
    throw new Error(`Tipo de producto sin regla de precio: ${tipo}`);
  }

  if (!Number.isInteger(pasajeros) || pasajeros < 1) {
    throw new Error('La cantidad de pasajeros debe ser un entero mayor o igual a 1');
  }

  const precio_unitario = calcularPrecioFinal(precio_base, markup_porcentaje);

  let unidades = 1;
  if (modalidad === 'por_noche_pasajero') {
    unidades = contarNoches(fecha_inicio, fecha_fin);
    if (!(unidades >= 1)) {
      throw new Error('La cantidad de noches debe ser al menos 1');
    }
  }

  // Se parte del unitario ya redondeado: es el precio que la agencia ve en
  // su catálogo, y el total tiene que ser exactamente ese número multiplicado.
  const precio_total = Number((precio_unitario * unidades * pasajeros).toFixed(2));

  return { precio_unitario, unidades, precio_total };
};

module.exports = {
  MODALIDAD_POR_TIPO,
  contarNoches,
  calcularPrecioFinal,
  calcularPrecioCotizacion,
};
