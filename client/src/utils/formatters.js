const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
// Fechas de calendario (viaje, disponibilidad, pago): se guardan como
// medianoche UTC del día elegido, así que se leen en UTC. En hora local
// argentina (UTC-3) esa medianoche cae el día anterior.
const calendarDateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '';
  const value = amount?.$numberDecimal ? parseFloat(amount.$numberDecimal) : amount;
  return currencyFormatter.format(value);
};

/** Día de un momento puntual (created_at, timestamps): en hora local. */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  return dateFormatter.format(new Date(dateString));
};

/** Fecha de calendario (fecha de viaje, disponibilidad, fecha de pago). */
export const formatFecha = (dateString) => {
  if (!dateString) return '';
  return calendarDateFormatter.format(new Date(dateString));
};

/**
 * Rango de fechas de una cotización o reserva. Una actividad dura un solo día
 * (inicio = fin): en ese caso se muestra una sola fecha.
 */
export const formatRangoFechas = (inicio, fin, separador = ' — ') => {
  const desde = formatFecha(inicio);
  const hasta = formatFecha(fin);
  return !hasta || desde === hasta ? desde : `${desde}${separador}${hasta}`;
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  return dateTimeFormatter.format(new Date(dateString));
};

const COTIZACION_LABELS = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  reserva_generada: 'Reserva Generada',
};

const RESERVA_LABELS = {
  pendiente_pago: 'Pendiente de Pago',
  pago_informado: 'Pago Informado',
  pagada: 'Pagada',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
};

export const formatEstadoCotizacion = (estado) =>
  COTIZACION_LABELS[estado] ?? estado;

export const formatEstadoReserva = (estado) =>
  RESERVA_LABELS[estado] ?? estado;
