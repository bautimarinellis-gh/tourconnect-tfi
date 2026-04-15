const mongoose = require('mongoose');

const agenciaSchema = new mongoose.Schema(
  {
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      required: [true, 'El mayorista asociado es obligatorio'],
    },
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario asociado es obligatorio'],
      unique: true, // Una agencia por usuario
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
agenciaSchema.index({ mayorista_id: 1 });
agenciaSchema.index({ activo: 1 });

// Transformación para JSON
agenciaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Agencia', agenciaSchema);
