import api from './api';

const agenciaService = {
  getAll: () => api.get('/agencias').then(r => r.data?.data ?? []),
  getById: (id) => api.get(`/agencias/${id}`).then(r => r.data?.data ?? r.data),
  create: (data) => api.post('/agencias', data).then(r => r.data),
  update: (id, data) => api.put(`/agencias/${id}`, data).then(r => r.data),
  delete: (id, data) => api.delete(`/agencias/${id}`, { data }).then(r => r.data),
  updateProducts: (id, data) => api.put(`/agencias/${id}/productos`, data).then(r => r.data),
  verificarDesactivacion: (id) => api.get(`/agencias/${id}/verificar-desactivacion`).then(r => r.data?.data),
  reactivar: (id) => api.patch(`/agencias/${id}/reactivar`).then(r => r.data),
};

export default agenciaService;
