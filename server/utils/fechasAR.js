/**
 * Helpers de fechas en horario de Argentina.
 *
 * Argentina está en UTC-3 fijo (no aplica horario de verano desde 2009), así
 * que alcanza con un offset constante en vez de una librería de zonas horarias.
 * Los límites de día se calculan en hora argentina y se devuelven como Date
 * (instantes UTC) listos para usar en queries de MongoDB.
 */

const OFFSET_AR_MS = 3 * 60 * 60 * 1000;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Fecha calendario actual en Argentina.
 * @returns {{ y: number, m: number, d: number, dow: number }} m 0-based, dow 0 = domingo
 */
function hoyAR(now = new Date()) {
  const local = new Date(now.getTime() - OFFSET_AR_MS);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    dow: local.getUTCDay(),
  };
}

/**
 * Instante de las 00:00 hora argentina del día indicado. Acepta valores fuera
 * de rango (d = 0, m = -1, ...) y los normaliza igual que Date.UTC.
 */
function inicioDiaAR(y, m, d) {
  return new Date(Date.UTC(y, m, d) + OFFSET_AR_MS);
}

module.exports = { MESES, hoyAR, inicioDiaAR };
