// Convierte un valor Decimal128 de Mongo (o cualquier numérico) a float de JS.
export const toFloat = (val) => {
  if (!val) return 0;
  if (val?.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(val.toString());
};
