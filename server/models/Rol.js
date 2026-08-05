const mongoose = require('mongoose');

/**
 * Rol — nodo compuesto del patrón Composite.
 *
 * Agrupa permisos y, como ellos, implementa `obtenerPermisos()`. Esa simetría
 * es la que permite que Usuario combine un rol con permisos sueltos sin que el
 * evaluador tenga que distinguirlos.
 *
 * Dos clases de rol:
 *  - Del sistema (`personalizado: false`, `mayorista_id: null`): documentos
 *    globales, únicos, compartidos por todos los tenants. Hoy solo
 *    "Administrador".
 *  - Personalizados (`personalizado: true`, `mayorista_id` obligatorio): los
 *    compone cada mayorista para su propia estructura interna.
 *
 * El rol es atómico a nivel Usuario: se asigna o se quita entero. Cambiar qué
 * permisos tiene se hace editando el rol, y eso afecta a todos los usuarios
 * que lo tengan.
 */
const rolSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del rol es obligatorio'],
      trim: true,
    },
    ambito: {
      type: String,
      enum: {
        values: ['Mayorista', 'Agencia'],
        message: 'Ámbito inválido: {VALUE}',
      },
      required: [true, 'El ámbito es obligatorio'],
    },
    personalizado: {
      type: Boolean,
      default: true,
    },
    // Un rol protegido no se edita, no se elimina y no se puede asignar desde
    // la aplicación. Es lo que impide que un mayorista se dé a sí mismo o a
    // otro usuario el rol Administrador.
    protegido: {
      type: Boolean,
      default: false,
    },
    mayorista_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mayorista',
      default: null,
    },
    permisos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permiso',
      },
    ],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Un mayorista no puede tener dos roles con el mismo nombre. Los roles del
// sistema comparten mayorista_id null, así que el índice también los mantiene
// únicos entre sí.
rolSchema.index({ mayorista_id: 1, nombre: 1 }, { unique: true });

/**
 * Un rol personalizado siempre pertenece a un mayorista, y uno del sistema
 * nunca. La equivalencia se valida acá para que no dependa de que cada
 * controller se acuerde de respetarla.
 */
rolSchema.pre('validate', function (next) {
  if (this.personalizado && !this.mayorista_id) {
    return next(
      new Error('Un rol personalizado debe pertenecer a un mayorista')
    );
  }
  if (!this.personalizado && this.mayorista_id) {
    return next(
      new Error('Un rol del sistema no puede pertenecer a un mayorista')
    );
  }
  next();
});

/**
 * IComponentePermiso.obtenerPermisos()
 *
 * Como nodo compuesto, delega en cada hijo y devuelve la unión. Delegar
 * (`hijo.obtenerPermisos()`) en vez de leer el hijo directamente es lo que
 * hace que el Composite sea real y no decorativo.
 *
 * El `Promise.all` es lo que mantiene esa promesa cierta: la hoja resuelve de
 * forma sincrónica y el compuesto necesita await, así que resolver cada hijo
 * sin asumir cuál de los dos es permite que el árbol tenga más de un nivel.
 * Hoy `permisos` solo referencia Permiso, pero el método no depende de eso.
 */
rolSchema.methods.obtenerPermisos = async function () {
  if (!this.populated('permisos')) {
    await this.populate('permisos');
  }
  const ramas = await Promise.all(
    this.permisos.map((hijo) => hijo.obtenerPermisos())
  );
  return ramas.flat();
};

rolSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Rol', rolSchema);
