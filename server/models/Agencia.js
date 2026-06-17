const mongoose = require('mongoose');
const Persona = require('./Persona');

const agenciaSchema = new mongoose.Schema({
  mayorista_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mayorista',
    required: [true, 'El mayorista asociado es obligatorio'],
  },
});

agenciaSchema.index({ mayorista_id: 1 });
// Cubre countDocuments({ mayorista_id, activo: true }) en getMayoristas y getMayoristaById
agenciaSchema.index({ mayorista_id: 1, activo: 1 });

agenciaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = Persona.discriminator('Agencia', agenciaSchema);
