import api from './api';

const productoService = {
  getAll: (params) => api.get('/productos', { params }).then(r => r.data?.data ?? []),
  getById: (id) => api.get(`/productos/${id}`).then(r => r.data),
  create: (data) => api.post('/productos', data).then(r => r.data),
  update: (id, data) => api.put(`/productos/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/productos/${id}`).then(r => r.data),
  checkAgencias: (id) => api.get(`/productos/${id}/agencias`).then(r => r.data),
};

export default productoService;
