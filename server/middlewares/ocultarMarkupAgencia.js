/**
 * Saca el markup de las respuestas que recibe una agencia.
 *
 * La agencia ve el precio final, nunca el precio base del mayorista. Pero con
 * el precio final y el porcentaje de markup despeja el base sin esfuerzo, así
 * que el porcentaje tampoco puede llegarle. Las cotizaciones guardan su
 * `markup_porcentaje` y las reservas la traen populada: en lugar de borrarlo
 * en cada controller (y olvidarse de alguno), se filtra a la salida.
 *
 * Va después de `auth`, que es el que deja `req.usuario`.
 */
const CAMPOS_OCULTOS = ['markup_porcentaje', 'markup_aplicado', 'precio_base'];

const limpiar = (valor) => {
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([clave]) => !CAMPOS_OCULTOS.includes(clave))
        .map(([clave, v]) => [clave, limpiar(v)])
    );
  }
  return valor;
};

const ocultarMarkupAgencia = (req, res, next) => {
  if (req.usuario?.rol !== 'agencia') return next();

  const json = res.json.bind(res);
  // Se pasa por JSON primero para trabajar sobre lo mismo que viaja: los
  // documentos de Mongoose, ObjectId y Decimal128 ya serializados.
  res.json = (body) => json(limpiar(JSON.parse(JSON.stringify(body ?? null))));
  next();
};

module.exports = ocultarMarkupAgencia;
