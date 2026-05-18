const mongoose = require('mongoose');

const historialEstadoReservaSchema = new mongoose.Schema(
  {
    reserva_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reserva',
      required: [true, 'La reserva es obligatoria'],
      index: true,
    },
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario es obligatorio'],
    },
    estado_anterior: {
      type: String,
      default: null,
    },
    estado_nuevo: {
      type: String,
      required: [true, 'El estado nuevo es obligatorio'],
    },
    comentario: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

historialEstadoReservaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('HistorialEstadoReserva', historialEstadoReservaSchema);
