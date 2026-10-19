/**
 * Migración manual: completa mayorista_id y agencia_id en las reservas
 * existentes. El server ya lo hace solo al arrancar; este script sirve para
 * correrlo sin levantar la aplicación (por ejemplo, antes de un despliegue).
 *
 * Uso: npm run migrate:reservas
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const { completarTenantReservas } = require('../utils/completarTenantReservas');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const completadas = await completarTenantReservas();
    console.log(`✅ Reservas completadas con mayorista_id/agencia_id: ${completadas}`);
  } catch (error) {
    console.error('❌ Error en la migración:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
