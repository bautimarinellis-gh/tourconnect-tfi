const mongoose = require('mongoose');
const Persona = require('./Persona');

const MOTIVOS_DESACTIVACION = [
  'incumplimiento_pago',
  'incumplimiento_terminos',
  'inactividad',
  'solicitud_agencia',
  'otro',
];

const agenciaSchema = new mongoose.Schema({
  mayorista_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mayorista',
    required: [true, 'El mayorista asociado es obligatorio'],
  },
  motivo_desactivacion: {
    type: String,
    enum: MOTIVOS_DESACTIVACION,
    default: null,
  },
  motivo_desactivacion_mensaje: {
    type: String,
    trim: true,
    maxlength: [500, 'El mensaje no puede superar los 500 caracteres'],
    default: null,
  },
  fecha_desactivacion: {
    type: Date,
    default: null,
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

const AgenciaModel = Persona.discriminator('Agencia', agenciaSchema);
AgenciaModel.MOTIVOS_DESACTIVACION = MOTIVOS_DESACTIVACION;

module.exports = AgenciaModel;
