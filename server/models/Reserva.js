const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema(
  {
    cotizacion_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cotizacion',
      required: [true, 'La cotización es obligatoria'],
      unique: true,
    },
    agencia_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agencia',
      required: [true, 'La agencia es obligatoria'],
      index: true,
    },
    producto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: [true, 'El producto es obligatorio'],
    },
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      required: [true, 'El mayorista es obligatorio'],
      index: true,
    },
    pasajeros: {
      type: Number,
      required: [true, 'La cantidad de pasajeros es obligatoria'],
      min: [1, 'Debe haber al menos 1 pasajero'],
    },
    fecha_inicio: {
      type: Date,
      required: [true, 'La fecha de inicio es obligatoria'],
    },
    fecha_fin: {
      type: Date,
      required: [true, 'La fecha de fin es obligatoria'],
    },
    precio_final: {
      type: mongoose.Types.Decimal128,
      required: [true, 'El precio final es obligatorio'],
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
    pago_informado_datos: {
      metodo: {
        type: String,
        enum: ['transferencia', 'efectivo', 'cheque', 'mercadopago', 'otro'],
      },
      comprobante: { type: String },
      fecha_pago: { type: Date },
      monto: { type: mongoose.Types.Decimal128 },
      notas: { type: String },
      informado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      informado_at: { type: Date },
    },
    rechazo_datos: {
      motivo: { type: String },
      rechazado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      rechazado_at: { type: Date },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Transformación para JSON
reservaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Reserva', reservaSchema);
