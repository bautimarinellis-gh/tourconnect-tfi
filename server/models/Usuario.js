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
      select: false,
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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

usuarioSchema.index({ invite_token: 1 });
usuarioSchema.index({ reset_token: 1 });

usuarioSchema.methods.compararPassword = async function (password) {
  return bcrypt.compare(password, this.password_hash);
};

usuarioSchema.statics.hashPassword = async function (password) {
  return bcrypt.hash(password, 12);
};

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
