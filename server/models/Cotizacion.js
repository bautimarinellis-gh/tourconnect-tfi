const mongoose = require('mongoose');
const { calcularVencimiento } = require('../utils/vigenciaCotizacion');

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
    // En una actividad (un solo día) fecha_fin es igual a fecha_inicio; en
    // hoteles y paquetes tiene que ser posterior.
    fecha_fin: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return this.tipo_producto === 'actividad'
            ? value >= this.fecha_inicio
            : value > this.fecha_inicio;
        },
        message: 'fecha_fin debe ser posterior a fecha_inicio',
      },
    },
    precio_total: {
      type: mongoose.Types.Decimal128,
      required: true,
    },
    // Registro de cómo se calculó el total al momento de cotizar (CU-03,
    // paso 10): si después cambian el precio base o el markup, la cotización
    // conserva los valores con los que se ofreció. Las cotizaciones previas a
    // estos campos los tienen en null.
    tipo_producto: {
      type: String,
      enum: ['hotel', 'actividad', 'paquete', null],
      default: null,
    },
    // Precio por unidad con el markup ya aplicado (lo que la agencia ve en su catálogo).
    precio_unitario: {
      type: mongoose.Types.Decimal128,
      default: null,
    },
    markup_porcentaje: {
      type: Number,
      default: null,
    },
    // Noches en un hotel; 1 en actividades y paquetes (ver precioCalculator).
    unidades: {
      type: Number,
      default: null,
    },
    estado: {
      type: String,
      enum: ['pendiente', 'aprobada', 'rechazada', 'vencida', 'cancelada', 'reserva_generada'],
      default: 'pendiente',
    },
    // Desde acá corre el plazo que tiene la agencia para confirmar la reserva
    // (ver utils/vigenciaCotizacion.js).
    aprobada_at: {
      type: Date,
      default: null,
    },
    motivo_rechazo: {
      type: String,
      trim: true,
      maxlength: [500, 'El motivo no puede superar los 500 caracteres'],
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
  // Las noches solo tienen sentido en un hotel.
  if (this.tipo_producto && this.tipo_producto !== 'hotel') return null;
  return Math.round((this.fecha_fin - this.fecha_inicio) / 86400000);
});

// Cuándo vence si nadie actúa (null si su estado no vence). Viaja en el JSON
// para que el frontend muestre la cuenta regresiva sin duplicar la regla.
cotizacionSchema.virtual('vence_at').get(function () {
  return calcularVencimiento(this);
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
