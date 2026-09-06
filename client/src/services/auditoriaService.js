import api from './api';

const auditoriaService = {
  getAll: (params) => api.get('/auditoria', { params }).then(r => r.data?.data),
  getById: (id) => api.get(`/auditoria/${id}`).then(r => r.data?.data),
  exportarPDF: (params) => api.get('/auditoria/exportar', { params, responseType: 'blob' }).then(r => r.data),
};

export default auditoriaService;
