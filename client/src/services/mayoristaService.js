import api from './api';

const mayoristaService = {
  getAll: () => api.get('/admin/mayoristas').then(r => r.data?.data ?? []),
  getById: (id) => api.get(`/admin/mayoristas/${id}`).then(r => r.data?.data ?? r.data),
  create: (data) => api.post('/admin/mayoristas', data).then(r => r.data),
  update: (id, data) => api.put(`/admin/mayoristas/${id}`, data).then(r => r.data),
  activarUsuario: (id, password) => api.post(`/admin/mayoristas/${id}/activar-usuario`, { password }).then(r => r.data),
  delete: (id) => api.delete(`/admin/mayoristas/${id}`).then(r => r.data)
};

export default mayoristaService;
