const mongoose = require('mongoose');
const Persona = require('./Persona');

const mayoristaSchema = new mongoose.Schema({
  plan_suscripcion: {
    type: String,
    trim: true,
    default: null,
  },
});

mayoristaSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = Persona.discriminator('Mayorista', mayoristaSchema);
