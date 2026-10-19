import api from './api';

const cotizacionService = {
  getAll: (params) => api.get('/cotizaciones', { params }).then(r => r.data?.data ?? []),
  // Listado paginado por el servidor: { items, pagination }
  getPagina: (params) => api.get('/cotizaciones', { params }).then(r => ({ items: r.data?.data ?? [], pagination: r.data?.pagination ?? null })),
  create: (data) => api.post('/cotizaciones', data).then(r => r.data),
  updateStatus: (id, status, motivo) => api.patch(`/cotizaciones/${id}/estado`, { estado: status, motivo_rechazo: motivo }).then(r => r.data),
  cancelar: (id, motivo) => api.patch(`/cotizaciones/${id}/cancelar`, { motivo_cancelacion: motivo }).then(r => r.data),
};

export default cotizacionService;
