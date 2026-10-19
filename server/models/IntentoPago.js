const mongoose = require('mongoose');

/**
 * Cada vez que la agencia toca "Pagar con Mercado Pago" se crea un intento
 * (una preferencia de Checkout Pro). Guarda también los intentos rechazados,
 * que no generan un Pago ni cambian el estado de la reserva pero sirven para
 * mostrarle a la agencia por qué no pasó y como evidencia de la operación.
 *
 * El tipo de cambio queda congelado acá: el monto en pesos que se validó
 * contra MP es el de este momento, aunque después cambie la configuración.
 */
const intentoPagoSchema = new mongoose.Schema(
  {
    reserva_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reserva',
      required: true,
      index: true,
    },
    mayorista_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Mayorista', default: null },
    agencia_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agencia', default: null },
    iniciado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    proveedor: {
      type: String,
      enum: ['mercadopago'],
      default: 'mercadopago',
    },
    preference_id: { type: String, required: true },
    monto_usd: { type: mongoose.Types.Decimal128, required: true },
    tipo_cambio: { type: Number, required: true },
    monto_ars: { type: Number, required: true },
    // creado: se generó el checkout y todavía no hay pago.
    // pendiente: MP recibió el pago pero no lo acreditó (efectivo, revisión).
    estado: {
      type: String,
      enum: ['creado', 'pendiente', 'aprobado', 'rechazado'],
      default: 'creado',
    },
    payment_id: { type: String, default: null },
    status_detail: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

intentoPagoSchema.index({ reserva_id: 1, created_at: -1 });

intentoPagoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('IntentoPago', intentoPagoSchema);
