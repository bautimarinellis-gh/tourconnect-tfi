const mongoose = require('mongoose');

// Set deliberadamente chico: solo lo que hace falta para auditar seguridad
// (login/logout, altas y bajas de acceso, intentos denegados) y la
// trazabilidad completa del elemento "core" del sistema (el ciclo de vida de
// una reserva). Cada acción nueva acá es una decisión, no un default.
const ACCIONES = [
  // Seguridad
  'LOGIN_EXITOSO',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'CAMBIO_PASSWORD',
  'RESET_PASSWORD',
  'USUARIO_CREADO',
  'USUARIO_DESACTIVADO',
  'ACCESO_DENEGADO',
  // Negocio — ciclo de vida completo de la reserva (trazabilidad, anexo 14.3)
  'RESERVA_CREADA',
  'PAGO_INFORMADO',
  'PAGO_CONFIRMADO',
  'PAGO_RECHAZADO',
  'RESERVA_CERRADA',
  'RESERVA_CANCELADA',
];

const auditLogSchema = new mongoose.Schema(
  {
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      default: null,
    },
    agencia_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agencia',
      default: null,
    },
    accion: {
      type: String,
      enum: ACCIONES,
      required: [true, 'La acción es obligatoria'],
    },
    categoria: {
      type: String,
      enum: ['seguridad', 'negocio'],
      required: [true, 'La categoría es obligatoria'],
    },
    entidad_afectada: {
      type: String,
      default: null,
    },
    entidad_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    detalle: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    resultado: {
      type: String,
      enum: ['exitoso', 'fallido'],
      default: 'exitoso',
    },
    ip_address: {
      type: String,
      default: null,
    },
    user_agent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'timestamp', updatedAt: false },
  }
);

// Vista mayorista: todos los eventos de su tenant ordenados cronológicamente
auditLogSchema.index({ mayorista_id: 1, timestamp: -1 });

// Vista agencia: sus propios eventos
auditLogSchema.index({ agencia_id: 1, timestamp: -1 });

// Vista admin + detección de brute-force por usuario
auditLogSchema.index({ usuario_id: 1, timestamp: -1 });

// Filtro por tipo de acción dentro de un tenant (panel de filtros de UI)
auditLogSchema.index({ mayorista_id: 1, accion: 1, timestamp: -1 });

auditLogSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.ACCIONES = ACCIONES;
