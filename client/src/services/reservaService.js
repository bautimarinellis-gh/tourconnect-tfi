import api from './api';

const reservaService = {
  getAll: (params) => api.get('/reservas', { params }).then(r => r.data?.data ?? []),
  getById: (id) => api.get(`/reservas/${id}`).then(r => r.data?.data),
  createFromQuote: (cotizacionId) => api.post(`/reservas/cotizacion/${cotizacionId}`, {}).then(r => r.data),
  pagar: (id) => api.put(`/reservas/${id}/pagar`).then(r => r.data),
  cerrar: (id) => api.put(`/reservas/${id}/cerrar`).then(r => r.data),
  cancelar: (id, motivo) => api.put(`/reservas/${id}/cancelar`, { motivo_cancelacion: motivo }).then(r => r.data),
  addPayment: (id, data) => api.post(`/reservas/${id}/pagos`, data).then(r => r.data),
  informarPago: (id, data) => api.post(`/reservas/${id}/informar-pago`, data).then(r => r.data),
  confirmarPago: (id) => api.post(`/reservas/${id}/confirmar-pago`).then(r => r.data),
  rechazarPago: (id, motivo) => api.post(`/reservas/${id}/rechazar-pago`, { motivo }).then(r => r.data),
};

export default reservaService;
