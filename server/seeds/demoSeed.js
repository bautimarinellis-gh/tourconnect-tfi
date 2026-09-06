/**
 * Seed de usuarios demo para grabar el instructivo del anexo 15.
 *
 * Crea (o actualiza) un Mayorista y una Agencia ya activos, con password
 * fijo, sin pasar por el flujo de invitación por mail. La Agencia queda
 * vinculada al Mayorista creado acá.
 *
 * Uso: node seeds/demoSeed.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const Usuario = require('../models/Usuario');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
const Rol = require('../models/Rol');
const { ROL_ADMINISTRADOR } = require('../utils/permisosCatalogo');

const MAYORISTA_DEMO = {
  email: 'mayorista@gmail.com',
  password: 'Mayorista123@',
  nombre: 'Mayorista Demo',
  razon_social: 'Mayorista Demo S.A.',
  cuit: '30-70000001-1',
};

const AGENCIA_DEMO = {
  email: 'agencia@gmail.com',
  password: 'Agencia123@',
  nombre: 'Agencia Demo',
  razon_social: 'Agencia Demo S.R.L.',
  cuit: '30-70000002-2',
};

const seedMayorista = async (rolAdministradorId) => {
  let usuario = await Usuario.findOne({ email: MAYORISTA_DEMO.email });

  if (usuario) {
    usuario.password_hash = await Usuario.hashPassword(MAYORISTA_DEMO.password);
    usuario.rol = 'mayorista';
    usuario.rol_id = rolAdministradorId;
    usuario.activo = true;
    await usuario.save();
    console.log(`⚠️  Usuario mayorista (${MAYORISTA_DEMO.email}) ya existía. Actualizado.`);
  } else {
    usuario = await Usuario.create({
      email: MAYORISTA_DEMO.email,
      password_hash: await Usuario.hashPassword(MAYORISTA_DEMO.password),
      rol: 'mayorista',
      rol_id: rolAdministradorId,
      activo: true,
    });
    console.log(`✅ Usuario mayorista creado: ${MAYORISTA_DEMO.email}`);
  }

  let mayorista = await Mayorista.findOne({ usuario_id: usuario._id });

  if (!mayorista) {
    mayorista = await Mayorista.create({
      usuario_id: usuario._id,
      nombre: MAYORISTA_DEMO.nombre,
      razon_social: MAYORISTA_DEMO.razon_social,
      cuit: MAYORISTA_DEMO.cuit,
      plan_suscripcion: 'Starter',
      activo: true,
    });
    usuario.mayorista_id = mayorista._id;
    await usuario.save();
    console.log(`✅ Mayorista (Persona) creado: ${MAYORISTA_DEMO.razon_social}`);
  } else {
    console.log(`⚠️  Mayorista (Persona) ya existía para ${MAYORISTA_DEMO.email}.`);
  }

  return mayorista;
};

const seedAgencia = async (mayoristaId) => {
  let usuario = await Usuario.findOne({ email: AGENCIA_DEMO.email });

  if (usuario) {
    usuario.password_hash = await Usuario.hashPassword(AGENCIA_DEMO.password);
    usuario.rol = 'agencia';
    usuario.activo = true;
    await usuario.save();
    console.log(`⚠️  Usuario agencia (${AGENCIA_DEMO.email}) ya existía. Actualizado.`);
  } else {
    usuario = await Usuario.create({
      email: AGENCIA_DEMO.email,
      password_hash: await Usuario.hashPassword(AGENCIA_DEMO.password),
      rol: 'agencia',
      activo: true,
    });
    console.log(`✅ Usuario agencia creado: ${AGENCIA_DEMO.email}`);
  }

  let agencia = await Agencia.findOne({ usuario_id: usuario._id });

  if (!agencia) {
    agencia = await Agencia.create({
      mayorista_id: mayoristaId,
      usuario_id: usuario._id,
      nombre: AGENCIA_DEMO.nombre,
      razon_social: AGENCIA_DEMO.razon_social,
      cuit: AGENCIA_DEMO.cuit,
      activo: true,
    });
    console.log(`✅ Agencia (Persona) creada: ${AGENCIA_DEMO.razon_social}`);
  } else {
    console.log(`⚠️  Agencia (Persona) ya existía para ${AGENCIA_DEMO.email}.`);
  }

  return agencia;
};

const seedDemo = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    const rolAdministrador = await Rol.findOne({
      nombre: ROL_ADMINISTRADOR,
      mayorista_id: null,
    }).select('_id');

    if (!rolAdministrador) {
      console.error(
        '❌ El rol Administrador no está inicializado. Levantá el servidor al menos una vez (bootstrapSeguridad) antes de correr este seed.'
      );
      process.exit(1);
    }

    const mayorista = await seedMayorista(rolAdministrador._id);
    await seedAgencia(mayorista._id);

    console.log('\nListo. Credenciales para el video:');
    console.log(`  Mayorista → ${MAYORISTA_DEMO.email} / ${MAYORISTA_DEMO.password}`);
    console.log(`  Agencia   → ${AGENCIA_DEMO.email} / ${AGENCIA_DEMO.password}`);

    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error.message);
    process.exit(1);
  }
};

seedDemo();
