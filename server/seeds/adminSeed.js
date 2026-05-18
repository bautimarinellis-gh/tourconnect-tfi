/**
 * Seed del usuario admin inicial.
 *
 * Usa las variables de entorno ADMIN_EMAIL y ADMIN_PASSWORD
 * para crear (o actualizar) el usuario admin.
 *
 * Uso: node seeds/adminSeed.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config({ path: '../.env' });

const Usuario = require('../models/Usuario');

const seedAdmin = async () => {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      console.error('❌ ADMIN_EMAIL y ADMIN_PASSWORD deben estar definidos en .env');
      process.exit(1);
    }

    // Verificar si ya existe
    const existente = await Usuario.findOne({ email });

    if (existente) {
      console.log(`⚠️  El usuario admin (${email}) ya existe. Actualizando...`);
      existente.password_hash = await Usuario.hashPassword(password);
      existente.activo = true;
      existente.rol = 'admin';
      await existente.save();
      console.log('✅ Usuario admin actualizado correctamente.');
    } else {
      const password_hash = await Usuario.hashPassword(password);

      await Usuario.create({
        email,
        password_hash,
        rol: 'admin',
        activo: true,
      });

      console.log(`✅ Usuario admin creado: ${email}`);
    }

    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error.message);
    process.exit(1);
  }
};

seedAdmin();
