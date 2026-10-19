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
    // Devolución al cancelar una reserva ya pagada (solo el mayorista). El
    // pago no se borra ni se marca rechazado: entró y después se devolvió.
    devuelto: {
      type: Boolean,
      default: false,
    },
    devolucion: {
      // pasarela: reembolso automático por la API de MP.
      // manual: el mayorista la hizo por fuera y registra cómo.
      origen: { type: String, enum: ['pasarela', 'manual', null], default: null },
      refund_id: { type: String, default: null },
      // true: el sandbox de MP no permitió el reembolso por API y se registró
      // como simulado (solo con credenciales de prueba; ver mercadoPago.js).
      simulada: { type: Boolean, default: false },
      metodo: { type: String, default: null },
      comprobante: { type: String, default: null },
      fecha: { type: Date, default: null },
      registrado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    },
    // manual: la agencia lo informa y el mayorista lo confirma o rechaza.
    // pasarela: lo acredita Mercado Pago; nadie lo confirma a mano.
    origen: {
      type: String,
      enum: ['manual', 'pasarela'],
      default: 'manual',
    },
    pasarela: {
      proveedor: { type: String, default: null },
      payment_id: { type: String, default: null },
      preference_id: { type: String, default: null },
      status: { type: String, default: null },
      status_detail: { type: String, default: null },
      medio: { type: String, default: null },
      monto_ars: { type: Number, default: null },
      tipo_cambio: { type: Number, default: null },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

// Un mismo pago de MP puede llegar varias veces (webhook repetido, webhook y
// retorno del checkout a la vez): el índice único evita registrarlo dos veces.
pagoSchema.index(
  { 'pasarela.payment_id': 1 },
  { unique: true, partialFilterExpression: { 'pasarela.payment_id': { $type: 'string' } } }
);

// Transformación para JSON
pagoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Pago', pagoSchema);
