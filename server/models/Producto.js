const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema(
  {
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      required: [true, 'El mayorista es obligatorio'],
    },
    tipo: {
      type: String,
      enum: {
        values: ['hotel', 'actividad', 'paquete'],
        message: '{VALUE} no es un tipo de producto válido',
      },
      required: [true, 'El tipo de producto es obligatorio'],
    },
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    descripcion: {
      type: String,
      required: [true, 'La descripción es obligatoria'],
    },
    precio_base: {
      type: Number,
      required: [true, 'El precio base es obligatorio'],
      min: [0, 'El precio base no puede ser negativo'],
    },
    disponibilidad_desde: {
      type: Date,
      required: [true, 'La fecha de disponibilidad desde es obligatoria'],
    },
    disponibilidad_hasta: {
      type: Date,
      required: [true, 'La fecha de disponibilidad hasta es obligatoria'],
    },
    activo: {
      type: Boolean,
      default: true,
    },
    // Campos específicos: hotel
    direccion: {
      type: String,
      trim: true,
    },
    estrellas: {
      type: Number,
      min: [1, 'La cantidad de estrellas debe ser al menos 1'],
      max: [5, 'La cantidad de estrellas no puede ser mayor a 5'],
    },
    // Campos específicos: actividad
    cupo_maximo: {
      type: Number,
      min: [1, 'El cupo máximo debe ser al menos 1'],
    },
    duracion_horas: {
      type: Number,
      min: [0, 'La duración en horas no puede ser negativa'],
    },
    // Campos específicos: paquete
    itinerario: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Índices útiles
productoSchema.index({ mayorista_id: 1, tipo: 1 });
productoSchema.index({ activo: 1 });

// Transformación para JSON
productoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Producto', productoSchema);
