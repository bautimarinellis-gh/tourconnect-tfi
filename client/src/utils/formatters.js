export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '';
  const value = amount?.$numberDecimal ? parseFloat(amount.$numberDecimal) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date);
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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
