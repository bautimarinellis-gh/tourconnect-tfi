import api from './api';

const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },
  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },
  setPassword: async (token, password) => {
    const response = await api.post(`/auth/set-password?token=${token}`, { password });
    return response.data;
  },
  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },
  resetPassword: async (token, password) => {
    const response = await api.post(`/auth/reset-password?token=${token}`, { password });
    return response.data;
  },
  resetPasswordSimple: async (email, nueva_password) => {
    const response = await api.post('/auth/reset-password-simple', { email, nueva_password });
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  }
};

export default authService;
