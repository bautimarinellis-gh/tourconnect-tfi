/**
 * Migración ÚNICA de usuarios al modelo de roles.
 *
 * Esto no es un seed: el catálogo de permisos y el rol Administrador se
 * sincronizan solos al arrancar el server (utils/bootstrapSeguridad.js), y los
 * mayoristas nuevos ya reciben el rol Administrador al darse de alta.
 *
 * Este script existe solo para las cuentas creadas ANTES de que existiera el
 * módulo de seguridad, que quedaron con rol_id vacío. Corriéndolo una vez se
 * puede borrar.
 *
 * No se corre automáticamente al arrancar a propósito: `rol_id: null` también
 * es un estado legítimo (a alguien le quitaron el rol), y repararlo en cada
 * arranque convertiría un reinicio en una vía de escalada de privilegios.
 *
 * Mapea el enum de ámbito actual al nuevo modelo:
 *   rol 'mayorista' → rol Administrador (protegido, global)
 *   rol 'agencia'   → sin rol_id: la agencia mantiene la relación 1:1 y se
 *                     autoriza por ámbito, sin permisos granulares
 *   rol 'admin'     → sin rol_id: el super-admin queda fuera del sistema de
 *                     permisos y tiene bypass total
 *
 * Idempotente: solo escribe donde rol_id está vacío, así que no pisa
 * asignaciones hechas a mano después de la primera corrida.
 *
 * Requiere que el server haya arrancado al menos una vez (es lo que crea el
 * rol Administrador).
 *
 * Uso: npm run migrate:roles
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const { ROL_ADMINISTRADOR } = require('../utils/permisosCatalogo');

const migrar = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    const rolAdministrador = await Rol.findOne({
      nombre: ROL_ADMINISTRADOR,
      mayorista_id: null,
    })
      .select('_id permisos')
      .lean();

    if (!rolAdministrador) {
      console.error(
        `❌ No existe el rol "${ROL_ADMINISTRADOR}". Arrancá el server una vez para que lo cree.`
      );
      process.exit(1);
    }

    const resultado = await Usuario.updateMany(
      { rol: 'mayorista', rol_id: null },
      { $set: { rol_id: rolAdministrador._id } }
    );

    console.log(
      `✅ ${resultado.modifiedCount} usuario(s) mayorista migrados a "${ROL_ADMINISTRADOR}"`
    );

    // Control de Fase 2: ningún usuario de ámbito mayorista debe quedar sin
    // rol. Si esto no da 0, la Fase 6 (retirar el enum como control de acceso)
    // dejaría a esos usuarios sin acceso a nada.
    const sinRol = await Usuario.countDocuments({
      rol: 'mayorista',
      rol_id: null,
    });

    if (sinRol > 0) {
      console.warn(`\n⚠️  ${sinRol} usuario(s) mayorista siguen sin rol_id`);
    } else {
      console.log("✅ Control OK: no quedan usuarios 'mayorista' sin rol_id");
    }

    const conAdmin = await Usuario.countDocuments({
      rol_id: rolAdministrador._id,
    });
    console.log(`ℹ️  ${conAdmin} usuario(s) con rol Administrador en total`);

    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la migración:', error.message);
    process.exit(1);
  }
};

migrar();
