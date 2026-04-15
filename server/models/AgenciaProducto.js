const mongoose = require('mongoose');

const agenciaProductoSchema = new mongoose.Schema(
  {
    agencia_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agencia',
      required: [true, 'La agencia es obligatoria'],
    },
    producto_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: [true, 'El producto es obligatorio'],
    },
    markup_porcentaje: {
      type: Number,
      required: [true, 'El porcentaje de markup es obligatorio'],
      min: [0, 'El markup no puede ser negativo'],
    },
    habilitado: {
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
agenciaProductoSchema.index({ agencia_id: 1, producto_id: 1 }, { unique: true });

// Transformación para JSON
agenciaProductoSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// ---------------------
// Métodos estáticos
// ---------------------

/**
 * Elimina en cascada todos los registros AgenciaProducto
 * asociados a un producto dado. Llamar al borrar un Producto.
 */
agenciaProductoSchema.statics.removeByProducto = function (productoId) {
  return this.deleteMany({ producto_id: productoId });
};

module.exports = mongoose.model('AgenciaProducto', agenciaProductoSchema);
