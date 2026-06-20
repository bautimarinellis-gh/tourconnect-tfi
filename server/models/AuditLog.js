const mongoose = require('mongoose');

const ACCIONES = [
  // Seguridad
  'LOGIN_EXITOSO',
  'LOGIN_FALLIDO',
  'LOGOUT',
  'SET_PASSWORD',
  'RESET_PASSWORD',
  'RESET_PASSWORD_SOLICITADO',
  'USUARIO_CREADO',
  'USUARIO_DESACTIVADO',
  'MAYORISTA_CREADO',
  'MAYORISTA_DESACTIVADO',
  'MAYORISTA_ACTUALIZADO',
  'AGENCIA_CREADA',
  'AGENCIA_DESACTIVADA',
  'AGENCIA_REACTIVADA',
  'USUARIO_REACTIVADO',
  // Negocio
  'COTIZACION_CREADA',
  'COTIZACION_APROBADA',
  'COTIZACION_RECHAZADA',
  'COTIZACION_CANCELADA',
  'RESERVA_CREADA',
  'PAGO_INFORMADO',
  'PAGO_CONFIRMADO',
  'PAGO_RECHAZADO',
  'RESERVA_CERRADA',
  'RESERVA_CANCELADA',
  'MARKUP_ACTUALIZADO',
  'PRODUCTOS_AGENCIA_SYNC',
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
