import api from './api';

const assistantService = {
  /**
   * Envía una consulta en lenguaje natural al Asistente Inteligente.
   * @param {string} query - La pregunta del usuario
   * @returns {Promise<object>} Respuesta del servidor con intent, data, summary, etc.
   */
  query: (query) => api.post('/assistant/query', { query }).then((r) => r.data),
};

export default assistantService;
