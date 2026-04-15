import api from './api';

const reporteService = {
  getAdminDashboard: () => api.get('/reportes/admin/dashboard').then(r => r.data?.data ?? r.data),
  getMayoristaDashboard: () => api.get('/reportes/dashboard').then(r => r.data?.data ?? r.data),
  getAgenciaDashboard: () => api.get('/reportes/mi-actividad').then(r => r.data?.data ?? r.data),
  getReservasPorMes: (params) => api.get('/reportes/reservas-por-mes', { params }).then(r => r.data),
  getRankingAgencias: (params) => api.get('/reportes/ranking-agencias', { params }).then(r => r.data),
  getProductosMasVendidos: (params) => api.get('/reportes/productos-mas-vendidos', { params }).then(r => r.data)
};

export default reporteService;
