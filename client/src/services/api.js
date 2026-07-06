import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // No redirigir si el 401 viene del login (credenciales incorrectas)
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('tourconnect_user_v1');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
