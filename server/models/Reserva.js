const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema(
  {
    cotizacion_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cotizacion',
      required: [true, 'La cotización es obligatoria'],
      unique: true,
    },
    // Copiados de la cotización al crear la reserva. Antes la reserva solo
    // sabía a quién pertenecía a través de su cotización, y cada listado,
    // reporte o consulta del asistente tenía que unir con TODAS las
    // cotizaciones del sistema para filtrar por tenant. Con estos campos se
    // filtra primero por índice y el $lookup solo recorre lo del tenant
    // (RNF-02), y la reserva por sí sola declara su dueño (RNF-03).
    // Las reservas previas se completan con utils/completarTenantReservas.js.
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      default: null,
    },
    agencia_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agencia',
      default: null,
    },
    estado: {
      type: String,
      enum: ['pendiente_pago', 'pago_informado', 'pagada', 'cerrada', 'cancelada'],
      default: 'pendiente_pago',
    },
    motivo_cancelacion: {
      type: String,
      trim: true,
      maxlength: [500, 'El motivo no puede superar los 500 caracteres'],
      required: function () {
        return this.estado === 'cancelada';
      },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Índices para filtros frecuentes en listados y aggregations de reportes
reservaSchema.index({ estado: 1 });
reservaSchema.index({ estado: 1, created_at: -1 });
// Filtro por tenant: listados, reportes y asistente del mayorista; vista de la agencia.
reservaSchema.index({ mayorista_id: 1, created_at: -1 });
reservaSchema.index({ mayorista_id: 1, estado: 1 });
reservaSchema.index({ agencia_id: 1, created_at: -1 });

reservaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Reserva', reservaSchema);
