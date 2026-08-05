const mongoose = require('mongoose');

/**
 * Permiso — hoja del patrón Composite.
 *
 * Es la unidad atómica de autorización. Junto con Rol implementa la interfaz
 * IComponentePermiso: ambos responden `obtenerPermisos()`, de modo que el
 * código que evalúa permisos no necesita saber si está frente a un permiso
 * suelto o a un rol que agrupa varios.
 *
 * El catálogo es fijo y lo define utils/permisosCatalogo.js; esta colección se
 * puebla desde el seed y no se edita desde la aplicación.
 */
const permisoSchema = new mongoose.Schema(
  {
    codigo: {
      type: String,
      required: [true, 'El código del permiso es obligatorio'],
      unique: true,
      trim: true,
    },
    descripcion: {
      type: String,
      required: [true, 'La descripción es obligatoria'],
      trim: true,
    },
    modulo: {
      type: String,
      required: [true, 'El módulo es obligatorio'],
      trim: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

/**
 * IComponentePermiso.obtenerPermisos()
 * Como hoja del Composite, un Permiso se devuelve a sí mismo.
 */
permisoSchema.methods.obtenerPermisos = function () {
  return [this];
};

permisoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Permiso', permisoSchema);
