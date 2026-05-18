const mongoose = require('mongoose');
const Persona = require('./Persona');
const { SUBSCRIPTION_PLAN_NAMES } = require('../utils/subscriptionPlans');

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
});

mayoristaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = Persona.discriminator('Mayorista', mayoristaSchema);
