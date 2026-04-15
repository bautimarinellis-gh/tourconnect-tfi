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

/**
 * Calcula el precio total de una cotización hotelera B2B.
 * Fórmula: precio_unitario × (1 + markup/100) × cantidad_noches × pasajeros
 * @param {number} precio_unitario Precio por noche/unidad del producto
 * @param {number} markup_porcentaje Porcentaje de markup a aplicar
 * @param {number} noches Cantidad de noches de la estadía
 * @param {number} pasajeros Cantidad de pasajeros
 * @returns {number} El precio total redondeado a 2 decimales
 */
const calcularPrecioTotal = (precio_unitario, markup_porcentaje, noches, pasajeros) => {
  if (
    typeof precio_unitario !== 'number' ||
    typeof markup_porcentaje !== 'number' ||
    typeof noches !== 'number' ||
    typeof pasajeros !== 'number'
  ) {
    throw new Error('Todos los parámetros deben ser numéricos');
  }

  if (precio_unitario < 0 || markup_porcentaje < 0) {
    throw new Error('El precio unitario y el markup deben ser números positivos');
  }

  if (noches < 1) {
    throw new Error('La cantidad de noches debe ser al menos 1');
  }

  if (pasajeros < 1) {
    throw new Error('La cantidad de pasajeros debe ser al menos 1');
  }

  const precioConMarkup = precio_unitario * (1 + markup_porcentaje / 100);
  return Number((precioConMarkup * noches * pasajeros).toFixed(2));
};

module.exports = {
  calcularPrecioFinal,
  calcularPrecioTotal,
};
