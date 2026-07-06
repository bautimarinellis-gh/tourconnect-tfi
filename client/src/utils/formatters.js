const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '';
  const value = amount?.$numberDecimal ? parseFloat(amount.$numberDecimal) : amount;
  return currencyFormatter.format(value);
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  return dateFormatter.format(new Date(dateString));
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
