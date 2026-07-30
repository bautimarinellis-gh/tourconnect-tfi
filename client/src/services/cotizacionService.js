import api from './api';

const cotizacionService = {
  getAll: (params) => api.get('/cotizaciones', { params }).then(r => r.data?.data ?? []),
  create: (data) => api.post('/cotizaciones', data).then(r => r.data),
  updateStatus: (id, status, motivo) => api.patch(`/cotizaciones/${id}/estado`, { estado: status, motivo_rechazo: motivo }).then(r => r.data),
  cancelar: (id) => api.patch(`/cotizaciones/${id}/cancelar`).then(r => r.data),
};

export default cotizacionService;
