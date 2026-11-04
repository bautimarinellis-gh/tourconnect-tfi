const rateLimit = require('express-rate-limit');

/**
 * Límites de tasa para los endpoints costosos (los de /auth están en authRoute).
 *
 * Los de usuarios logueados cuentan por usuario y no por IP: varias personas
 * de una agencia pueden salir por la misma IP, y un mismo usuario no debería
 * poder esquivar el límite cambiando de red. Van después de `auth`.
 */
const porUsuario = (req) => String(req.usuario?.id ?? 'anonimo');

const mensaje = (texto) => ({ success: false, message: texto });

// Asistente: cada pregunta usa hasta 2 pedidos a Gemini y la cuota gratuita
// es global (15 por minuto). Sin límite, un usuario la agotaba para todos.
const limiteAsistente = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: porUsuario,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Hiciste muchas consultas seguidas. Esperá un minuto y volvé a intentar.'),
});

// Exportaciones a PDF: varias agregaciones más pdfkit por cada descarga.
const limiteExportacion = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: porUsuario,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Demasiadas exportaciones seguidas. Esperá un minuto.'),
});

// Webhook de Mercado Pago: es público y cada llamada consulta la API de MP.
// MP manda pocas notificaciones por pago, así que el tope es holgado.
const limiteWebhook = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Demasiadas notificaciones.'),
});

module.exports = { limiteAsistente, limiteExportacion, limiteWebhook };
