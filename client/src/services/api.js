import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Marca que hay un cierre de sesión en curso.
 *
 * Al desloguearse, el token se invalida en el servidor y cualquier request que
 * haya quedado en vuelo vuelve con 401. Sin esta marca, el interceptor
 * reaccionaría a esos 401 con `window.location.href`, que recarga la página
 * entera por encima de la navegación normal al login. El usuario ve la
 * pantalla refrescarse sola justo cuando está saliendo.
 */
let cerrandoSesion = false;
export const marcarCierreDeSesion = () => {
  cerrandoSesion = true;
};

/**
 * Vuelve a habilitar el redirect por 401. Se llama al iniciar sesión: el
 * logout es una navegación del SPA, no una recarga, así que el módulo
 * conserva su estado y sin este reset la sesión siguiente se quedaría sin
 * redirección automática al vencer el token.
 */
export const marcarSesionIniciada = () => {
  cerrandoSesion = false;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (cerrandoSesion && error.response?.status === 401) {
      return Promise.reject(error);
    }

    if (error.response?.status === 403 && error.response.data?.code === 'ACCOUNT_DISABLED') {
      sessionStorage.setItem('tourconnect_auth_message', error.response.data.message);
      localStorage.removeItem('tourconnect_user_v1');
      window.location.href = '/login';
      return Promise.reject(error);
    }

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
