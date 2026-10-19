const { hoyAR } = require('./fechasAR');

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Fecha de hoy en Argentina en formato YYYY-MM-DD, para comparar contra los
 * inputs de fecha que llegan del frontend en ese mismo formato.
 *
 * Se calcula en hora argentina y no en la del servidor: en un servidor cloud
 * en UTC, entre las 21 y las 24 hs de Argentina "hoy" ya sería mañana y se
 * rechazarían cotizaciones y reservas para el día en curso.
 *
 * Comparar como string YYYY-MM-DD evita mezclar `new Date(str)` (medianoche
 * UTC) con medianoches locales.
 */
const hoyDateString = (now = new Date()) => {
  const { y, m, d } = hoyAR(now);
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
};

/**
 * Convierte un valor de fecha (string YYYY-MM-DD o Date) a YYYY-MM-DD.
 * Las fechas de calendario (viaje, disponibilidad) se guardan como
 * medianoche UTC del día elegido, por eso se leen en UTC.
 */
const toDateString = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/**
 * Suma (o resta) días a una fecha de calendario y la devuelve como YYYY-MM-DD.
 * Trabaja en UTC, igual que el formato en que se guardan esas fechas.
 */
const sumarDias = (v, dias) => {
  const base = toDateString(v);
  if (!base) return null;
  const fecha = new Date(`${base}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

module.exports = { hoyDateString, toDateString, sumarDias };
