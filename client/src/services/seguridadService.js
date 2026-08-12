import api from './api';

const seguridadService = {
  getPermisos: () => api.get('/seguridad/permisos').then(r => r.data?.data),

  getRoles: () => api.get('/seguridad/roles').then(r => r.data?.data),
  createRol: (data) => api.post('/seguridad/roles', data).then(r => r.data?.data),
  updateRol: (id, data) => api.put(`/seguridad/roles/${id}`, data).then(r => r.data?.data),
  deleteRol: (id) => api.delete(`/seguridad/roles/${id}`).then(r => r.data),

  getUsuarios: () => api.get('/seguridad/usuarios').then(r => r.data?.data),
  createUsuario: (data) => api.post('/seguridad/usuarios', data).then(r => r.data?.data),
  updateUsuario: (id, data) => api.put(`/seguridad/usuarios/${id}`, data).then(r => r.data?.data),
  desactivarUsuario: (id) => api.delete(`/seguridad/usuarios/${id}`).then(r => r.data),
  reactivarUsuario: (id) => api.patch(`/seguridad/usuarios/${id}/reactivar`).then(r => r.data),
  resetearClave: (id) => api.patch(`/seguridad/usuarios/${id}/resetear-clave`).then(r => r.data),
  asignarRol: (id, rol_id) =>
    api.patch(`/seguridad/usuarios/${id}/rol`, { rol_id }).then(r => r.data?.data),
  asignarPermisos: (id, permisos) =>
    api.patch(`/seguridad/usuarios/${id}/permisos`, { permisos }).then(r => r.data?.data),
};

export default seguridadService;
