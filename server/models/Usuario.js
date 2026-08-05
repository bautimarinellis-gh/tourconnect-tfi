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
    // Ámbito del usuario: de qué lado del negocio está. NO es un rol de
    // permisos — de este campo dependen el scoping por tenant, la revalidación
    // de cuenta y el ruteo del frontend. Los permisos viven en rol_id /
    // permisos_individuales (ver el módulo de seguridad).
    rol: {
      type: String,
      enum: {
        values: ['admin', 'mayorista', 'agencia'],
        message: 'Rol inválido: {VALUE}',
      },
      required: [true, 'El rol es obligatorio'],
    },
    // Nombre propio del usuario. Solo lo usan los usuarios internos de un
    // mayorista, que no tienen Persona: para el dueño original y para las
    // agencias el nombre sigue saliendo de la Persona asociada.
    nombre: {
      type: String,
      trim: true,
      default: null,
    },
    // Tenant al que pertenece el usuario. Hasta ahora el vínculo existía solo
    // al revés (Persona.usuario_id), lo que forzaba un único usuario por
    // mayorista. Con este campo un mayorista puede tener varios usuarios
    // internos, todos apuntando a la misma Persona Mayorista.
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      default: null,
    },
    // Rol asignado. Es atómico: se asigna o se quita entero, nunca se le
    // saca un permiso suelto a nivel usuario. Para eso se compone otro rol.
    rol_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rol',
      default: null,
    },
    // Permisos sueltos, aditivos e independientes entre sí: cada uno se
    // agrega o se quita por separado, sin afectar a los demás ni al rol.
    // Los permisos efectivos son la unión de estos con los del rol.
    permisos_individuales: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permiso',
      },
    ],
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
    // Código de verificación de 6 dígitos (se guarda hasheado, nunca en claro)
    reset_code_hash: {
      type: String,
      select: false,
    },
    reset_code_expires: {
      type: Date,
      select: false,
    },
    reset_code_attempts: {
      type: Number,
      select: false,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

usuarioSchema.index({ invite_token: 1 });
usuarioSchema.index({ reset_token: 1 });
usuarioSchema.index({ mayorista_id: 1 });

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
    delete ret.reset_code_hash;
    delete ret.reset_code_expires;
    delete ret.reset_code_attempts;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Usuario', usuarioSchema);
