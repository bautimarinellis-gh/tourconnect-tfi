const mongoose = require('mongoose');

const cotizacionSchema = new mongoose.Schema(
  {
    agencia_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agencia',
      required: true,
    },
    producto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: true,
    },
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      required: true,
      index: true,
    },
    pasajeros: {
      type: Number,
      required: true,
      min: 1,
    },
    fecha_inicio: {
      type: Date,
      required: true,
    },
    fecha_fin: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return value > this.fecha_inicio;
        },
        message: 'fecha_fin debe ser posterior a fecha_inicio',
      },
    },
    precio_total: {
      type: mongoose.Types.Decimal128,
      required: true,
    },
    estado: {
      type: String,
      enum: ['pendiente', 'aprobada', 'rechazada', 'vencida', 'cancelada', 'reserva_generada'],
      default: 'pendiente',
    },
    motivo_rechazo: {
      type: String,
      required: function () {
        return this.estado === 'rechazada';
      },
    },
    // Opcional: lo escribe la agencia al cancelar su propia cotización.
    // A diferencia de motivo_rechazo, no es obligatorio — cancelar una
    // cotización propia no requiere justificarse ante nadie.
    motivo_cancelacion: {
      type: String,
      trim: true,
      maxlength: [500, 'El motivo no puede superar los 500 caracteres'],
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

cotizacionSchema.virtual('cantidad_noches').get(function () {
  if (!this.fecha_inicio || !this.fecha_fin) return null;
  return Math.round((this.fecha_fin - this.fecha_inicio) / 86400000);
});

// Índices compuestos para queries del Asistente Inteligente y reportes
cotizacionSchema.index({ mayorista_id: 1, created_at: -1 });
cotizacionSchema.index({ mayorista_id: 1, agencia_id: 1 });
cotizacionSchema.index({ mayorista_id: 1, estado: 1 });
// Cron de vencimiento: { estado: 'pendiente', created_at: { $lt: ... } }
cotizacionSchema.index({ estado: 1, created_at: 1 });
// Queries de agencia sin mayorista_id (getCotizaciones, getAgenciaDashboard)
cotizacionSchema.index({ agencia_id: 1, estado: 1, created_at: -1 });

module.exports = mongoose.model('Cotizacion', cotizacionSchema);
