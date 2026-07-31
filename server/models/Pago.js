const mongoose = require('mongoose');

const pagoSchema = new mongoose.Schema(
  {
    reserva_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reserva',
      required: [true, 'La reserva es obligatoria'],
      index: true,
    },
    registrado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario que registra el pago es obligatorio'],
    },
    monto: {
      type: mongoose.Types.Decimal128,
      required: [true, 'El monto es obligatorio'],
      validate: {
        validator: function (v) {
          return parseFloat(v.toString()) > 0;
        },
        message: 'El monto debe ser positivo',
      },
    },
    metodo: {
      type: String,
      enum: ['transferencia', 'efectivo', 'cheque', 'mercadopago', 'otro'],
      default: 'transferencia',
    },
    comprobante: {
      type: String,
    },
    notas: {
      type: String,
    },
    fecha_pago: {
      type: Date,
      required: [true, 'La fecha de pago es obligatoria'],
    },
    // Un pago rechazado no se elimina (es evidencia de la operación): se
    // marca y se excluye de los totales pagados y de la validación de
    // monto en pagarReserva.
    rechazado: {
      type: Boolean,
      default: false,
    },
    motivo_rechazo: {
      type: String,
      default: null,
    },
    rechazado_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

// Transformación para JSON
pagoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Pago', pagoSchema);
