import api from './api';

const assistantService = {
  /**
   * Envía una consulta en lenguaje natural al Asistente Inteligente.
   * @param {string} query - La pregunta del usuario
   * @param {Array<{pregunta, intent, params}>} historial - Preguntas anteriores,
   *        para que la IA entienda seguimientos ("¿y el mes anterior?")
   * @returns {Promise<object>} Respuesta del servidor con intent, data, summary, origen, ia, etc.
   */
  query: (query, historial = []) =>
    api.post('/assistant/query', { query, historial }).then((r) => r.data),

  /** Estado de la IA (Gemini) para el indicador del widget. */
  estado: () => api.get('/assistant/estado').then((r) => r.data.ia),
};

export default assistantService;
