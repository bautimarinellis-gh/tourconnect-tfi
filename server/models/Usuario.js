const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email inválido'],
    },
    password_hash: {
      type: String,
      select: false, // Nunca se devuelve en queries por defecto
    },
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      maxlength: [100, 'El nombre no puede superar los 100 caracteres'],
    },
    rol: {
      type: String,
      enum: {
        values: ['admin', 'mayorista', 'agencia'],
        message: 'Rol inválido: {VALUE}',
      },
      required: [true, 'El rol es obligatorio'],
    },
    activo: {
      type: Boolean,
      default: false,
    },
    invite_token: {
      type: String,
      select: false,
    },
    invite_token_expires: {
      type: Date,
      select: false,
    },
    reset_token: {
      type: String,
      select: false,
    },
    reset_token_expires: {
      type: Date,
      select: false,
    },
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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// ---------------------
// Índices
// ---------------------
usuarioSchema.index({ invite_token: 1 });
usuarioSchema.index({ reset_token: 1 });

// ---------------------
// Métodos de instancia
// ---------------------

/**
 * Compara una contraseña en texto plano con el hash almacenado.
 */
usuarioSchema.methods.compararPassword = async function (password) {
  return bcrypt.compare(password, this.password_hash);
};

// ---------------------
// Métodos estáticos
// ---------------------

/**
 * Hashea una contraseña con bcrypt (salt rounds = 12).
 */
usuarioSchema.statics.hashPassword = async function (password) {
  return bcrypt.hash(password, 12);
};

// ---------------------
// Transformación de JSON
// ---------------------
usuarioSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password_hash;
    delete ret.invite_token;
    delete ret.invite_token_expires;
    delete ret.reset_token;
    delete ret.reset_token_expires;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Usuario', usuarioSchema);
