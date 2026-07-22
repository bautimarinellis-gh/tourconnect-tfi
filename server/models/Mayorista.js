const mongoose = require('mongoose');
const Persona = require('./Persona');
const { SUBSCRIPTION_PLAN_NAMES } = require('../utils/subscriptionPlans');

const MOTIVOS_DESACTIVACION = [
  'incumplimiento_pago',
  'incumplimiento_terminos',
  'inactividad',
  'solicitud_mayorista',
  'otro',
];

const mayoristaSchema = new mongoose.Schema({
  plan_suscripcion: {
    type: String,
    trim: true,
    enum: {
      values: SUBSCRIPTION_PLAN_NAMES,
      message: 'El plan de suscripción no es válido',
    },
    default: 'Starter',
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

mayoristaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const MayoristaModel = Persona.discriminator('Mayorista', mayoristaSchema);
MayoristaModel.MOTIVOS_DESACTIVACION = MOTIVOS_DESACTIVACION;

module.exports = MayoristaModel;
