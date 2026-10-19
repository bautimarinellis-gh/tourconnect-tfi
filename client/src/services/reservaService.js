import api from './api';

const reservaService = {
  getAll: (params) => api.get('/reservas', { params }).then(r => r.data?.data ?? []),
  // Listado paginado por el servidor: { items, pagination }
  getPagina: (params) => api.get('/reservas', { params }).then(r => ({ items: r.data?.data ?? [], pagination: r.data?.pagination ?? null })),
  getById: (id) => api.get(`/reservas/${id}`).then(r => r.data?.data),
  createFromQuote: (cotizacionId) => api.post(`/reservas/cotizacion/${cotizacionId}`, {}).then(r => r.data),
  cerrar: (id) => api.put(`/reservas/${id}/cerrar`).then(r => r.data),
  // devolucion ({ metodo, comprobante }): solo si la reserva pagada tiene pagos manuales.
  cancelar: (id, motivo, devolucion) =>
    api.put(`/reservas/${id}/cancelar`, { motivo_cancelacion: motivo, ...(devolucion && { devolucion }) }).then(r => r.data),
  informarPago: (id, data) => api.post(`/reservas/${id}/informar-pago`, data).then(r => r.data),
  confirmarPago: (id) => api.post(`/reservas/${id}/confirmar-pago`).then(r => r.data),
  rechazarPago: (id, motivo) => api.post(`/reservas/${id}/rechazar-pago`, { motivo }).then(r => r.data),
  // Pasarela (Mercado Pago, modo prueba): { url_checkout, monto_ars, tipo_cambio }
  iniciarCheckoutMP: (id) => api.post(`/reservas/${id}/mercadopago/checkout`).then(r => r.data?.data),
  // Sin paymentId, el servidor busca el último pago de la reserva en MP.
  verificarPagoMP: (id, paymentId) =>
    api.post(`/reservas/${id}/mercadopago/verificar`, paymentId ? { payment_id: paymentId } : {}).then(r => r.data?.data),
};

export default reservaService;
