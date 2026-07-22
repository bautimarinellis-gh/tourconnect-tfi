const mongoose = require('mongoose');

const historialEstadoPersonaSchema = new mongoose.Schema(
  {
    persona_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'La persona (agencia/mayorista) es obligatoria'],
      index: true,
    },
    persona_tipo: {
      type: String,
      enum: ['Mayorista', 'Agencia'],
      required: [true, 'El tipo de persona es obligatorio'],
    },
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario que realizó el cambio es obligatorio'],
    },
    estado_anterior: {
      type: Boolean,
      required: [true, 'El estado anterior es obligatorio'],
    },
    estado_nuevo: {
      type: Boolean,
      required: [true, 'El estado nuevo es obligatorio'],
    },
    motivo: {
      type: String,
      default: null,
    },
    motivo_mensaje: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

historialEstadoPersonaSchema.index({ persona_id: 1, created_at: 1 });

historialEstadoPersonaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('HistorialEstadoPersona', historialEstadoPersonaSchema);
