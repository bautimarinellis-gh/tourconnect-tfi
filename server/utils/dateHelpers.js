/**
 * Fecha de hoy (local del servidor) en formato YYYY-MM-DD, para comparar
 * contra los inputs de fecha que llegan del frontend en ese mismo formato.
 *
 * Comparar como string YYYY-MM-DD evita el bug de mezclar `new Date(str)`
 * (que parsea a medianoche UTC) con `new Date()` + setHours(0,0,0,0) (que
 * usa medianoche local): en timezones detrás de UTC eso hace que "hoy"
 * parezca anterior a sí mismo.
 */
const hoyDateString = () => new Date().toLocaleDateString('en-CA');

/** Convierte un valor de fecha (string YYYY-MM-DD o Date) a YYYY-MM-DD. */
const toDateString = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

module.exports = { hoyDateString, toDateString };
