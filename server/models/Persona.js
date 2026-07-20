const mongoose = require('mongoose');

const personaSchema = new mongoose.Schema(
  {
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario asociado es obligatorio'],
      unique: true,
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
      // Normaliza quitando espacios, guiones, puntos y paréntesis (conserva el + inicial).
      // Si aun así no queda un número válido (p. ej. contiene letras), se deja tal cual para que el validator lo rechace.
      set: (v) => {
        if (typeof v !== 'string') return v;
        const trimmed = v.trim();
        if (!trimmed) return null;
        const cleaned = trimmed.replace(/[\s\-().]/g, '');
        if (/^\+?\d{6,15}$/.test(cleaned)) return cleaned;
        return trimmed;
      },
      validate: {
        validator: (v) => v == null || /^\+?\d{6,15}$/.test(v),
        message: 'El teléfono solo puede contener números (6 a 15 dígitos, opcionalmente con + inicial).',
      },
    },
    cuit: {
      type: String,
      required: [true, 'El CUIT es obligatorio'],
      // Normaliza "20111111111", "20.11111111.1" o "20-11111111-1" al formato canónico.
      // Si no reduce a 11 dígitos (p. ej. contiene letras), se deja tal cual para que el validator lo rechace.
      set: (v) => {
        if (typeof v !== 'string') return v;
        const cleaned = v.replace(/[-.\s]/g, '');
        if (/^\d{11}$/.test(cleaned)) {
          return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 10)}-${cleaned.slice(10)}`;
        }
        return v.trim();
      },
      validate: {
        validator: (v) => /^\d{2}-\d{8}-\d{1}$/.test(v),
        message: 'El CUIT debe tener el formato XX-XXXXXXXX-X (11 dígitos, sin letras).',
      },
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    discriminatorKey: '__t',
  }
);

// Índice de activo eliminado — baja cardinalidad (boolean), MongoDB lo ignora en práctica.
// Las subclases (Agencia) definen sus propios compound indexes más selectivos.

personaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Persona', personaSchema);
