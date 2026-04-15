const mongoose = require('mongoose');

const mayoristaSchema = new mongoose.Schema(
  {
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario asociado es obligatorio'],
      unique: true, // Un mayorista por usuario
    },
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      maxlength: [100, 'El nombre no puede superar los 100 caracteres'],
    },
    razon_social: {
      type: String,
      required: [true, 'La razón social es obligatoria'],
      trim: true,
      maxlength: [150, 'La razón social no puede superar los 150 caracteres'],
    },
    telefono: {
      type: String,
      trim: true,
      default: null,
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// ---------------------
// Índices
// ---------------------
mayoristaSchema.index({ activo: 1 });

// Transformación para JSON
mayoristaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Mayorista', mayoristaSchema);
