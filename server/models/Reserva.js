const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema(
  {
    cotizacion_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cotizacion',
      required: [true, 'La cotización es obligatoria'],
      unique: true,
    },
    estado: {
      type: String,
      enum: ['pendiente_pago', 'pago_informado', 'pagada', 'cerrada', 'cancelada'],
      default: 'pendiente_pago',
    },
    motivo_cancelacion: {
      type: String,
      required: function () {
        return this.estado === 'cancelada';
      },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

reservaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Reserva', reservaSchema);
