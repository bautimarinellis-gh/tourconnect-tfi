const mongoose = require('mongoose');

const cotizacionSchema = new mongoose.Schema({
  agencia_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agencia',
    required: true
  },
  producto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  mayorista_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mayorista',
    required: true,
    index: true
  },
  pasajeros: {
    type: Number,
    required: true,
    min: 1
  },
  fecha_inicio: {
    type: Date,
    required: true
  },
  fecha_fin: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value > this.fecha_inicio;
      },
      message: 'fecha_fin debe ser posterior a fecha_inicio'
    }
  },
  precio_unitario_snapshot: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  markup_snapshot: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  precio_total: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  estado: {
    type: String,
    enum: ['pendiente', 'aprobada', 'rechazada', 'vencida', 'cancelada', 'reserva_generada'],
    default: 'pendiente'
  },
  motivo_rechazo: {
    type: String,
    required: function() {
      return this.estado === 'rechazada';
    }
  },
  motivo_cancelacion: {
    type: String,
  },
  notas: {
    type: String
  },
  reserva_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reserva'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

cotizacionSchema.virtual('cantidad_noches').get(function() {
  if (!this.fecha_inicio || !this.fecha_fin) return null;
  return Math.round((this.fecha_fin - this.fecha_inicio) / 86400000);
});

cotizacionSchema.virtual('precio_unitario_con_markup').get(function() {
  if (!this.precio_unitario_snapshot || !this.markup_snapshot) return null;
  const precioUnitario = parseFloat(this.precio_unitario_snapshot.toString());
  const markup = parseFloat(this.markup_snapshot.toString());
  return Number((precioUnitario * (1 + markup / 100)).toFixed(2));
});

module.exports = mongoose.model('Cotizacion', cotizacionSchema);
