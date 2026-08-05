const Permiso = require('../models/Permiso');
const Rol = require('../models/Rol');
const Usuario = require('../models/Usuario');
const Mayorista = require('../models/Mayorista');
const { PERMISOS, ROL_ADMINISTRADOR } = require('./permisosCatalogo');

/**
 * Deja el módulo de seguridad listo para operar. Corre al arrancar el server,
 * antes de aceptar requests.
 *
 * Reemplaza a los seeds manuales: el catálogo de permisos y el rol
 * Administrador son datos de referencia derivados de permisosCatalogo.js, no
 * datos que alguien cargue a mano. Agregar un permiso al catálogo y reiniciar
 * alcanza para que exista y para que el rol Administrador lo incluya.
 *
 * Todo lo que hace es idempotente y seguro de repetir en cada arranque.
 *
 * Lo que NO hace, a propósito: asignarle el rol Administrador a usuarios que
 * no tienen rol. `rol_id: null` es un estado legítimo — significa que alguien
 * le quitó el rol a esa persona. Repararlo en cada arranque convertiría un
 * reinicio del server en una vía de escalada de privilegios, y anularía el
 * punto único de falla que el diseño acepta de forma explícita.
 */
const bootstrapSeguridad = async () => {
  // 1. Catálogo de permisos
  await Permiso.bulkWrite(
    PERMISOS.map((permiso) => ({
      updateOne: {
        filter: { codigo: permiso.codigo },
        update: { $set: permiso },
        upsert: true,
      },
    }))
  );

  // 2. Retirar permisos que ya no están en el catálogo, junto con las
  //    referencias que les apunten. Sin esto, un rol o un usuario quedan
  //    apuntando a un documento borrado: el populate devuelve null y la
  //    resolución de permisos se cae al intentar leerle el código.
  const obsoletos = await Permiso.find({
    codigo: { $nin: PERMISOS.map((p) => p.codigo) },
  })
    .select('_id codigo')
    .lean();

  if (obsoletos.length > 0) {
    const idsObsoletos = obsoletos.map((p) => p._id);

    // Se quitan de roles y usuarios, no se reemplazan por su equivalente
    // más amplio: convertir un permiso de lectura en uno de gestión sería
    // ampliarle el alcance a alguien sin que nadie lo haya decidido.
    const [roles, usuarios] = await Promise.all([
      Rol.updateMany(
        { permisos: { $in: idsObsoletos } },
        { $pull: { permisos: { $in: idsObsoletos } } }
      ),
      Usuario.updateMany(
        { permisos_individuales: { $in: idsObsoletos } },
        { $pull: { permisos_individuales: { $in: idsObsoletos } } }
      ),
    ]);

    await Permiso.deleteMany({ _id: { $in: idsObsoletos } });

    console.warn(
      `🧹 ${obsoletos.length} permiso(s) fuera del catálogo eliminados: ` +
        obsoletos.map((p) => p.codigo).join(', ') +
        `\n   Se quitaron de ${roles.modifiedCount} rol(es) y ${usuarios.modifiedCount} usuario(s).` +
        '\n   Revisá que esos roles sigan teniendo sentido — pueden haber quedado vacíos.'
    );
  }

  // 3. Rol Administrador: global, protegido, con todos los permisos. Se
  //    resincroniza para que un permiso nuevo del catálogo quede incluido.
  const idsTodos = (await Permiso.find().select('_id').lean()).map((p) => p._id);

  await Rol.updateOne(
    { nombre: ROL_ADMINISTRADOR, mayorista_id: null },
    {
      $set: {
        nombre: ROL_ADMINISTRADOR,
        ambito: 'Mayorista',
        personalizado: false,
        protegido: true,
        mayorista_id: null,
        permisos: idsTodos,
      },
    },
    { upsert: true }
  );

  // 4. Reparar el vínculo Usuario → Mayorista donde falte.
  //    A diferencia del rol, acá no hay estado legítimo posible: un usuario de
  //    ámbito mayorista siempre pertenece a un tenant. Si falta es porque el
  //    dato viene de antes de que Usuario.mayorista_id existiera.
  const mayoristas = await Mayorista.find({ usuario_id: { $ne: null } })
    .select('_id usuario_id')
    .lean();

  const reparaciones = mayoristas.map((mayorista) => ({
    updateOne: {
      filter: { _id: mayorista.usuario_id, mayorista_id: null },
      update: { $set: { mayorista_id: mayorista._id } },
    },
  }));

  let vinculosReparados = 0;
  if (reparaciones.length > 0) {
    const resultado = await Usuario.bulkWrite(reparaciones);
    vinculosReparados = resultado.modifiedCount ?? 0;
  }

  // 5. Aviso, no reparación: usuarios que quedaron sin rol. Puede ser
  //    intencional (se lo quitaron) o dato viejo sin migrar. El server no
  //    decide cuál de las dos cosas es.
  const sinRol = await Usuario.countDocuments({
    rol: 'mayorista',
    rol_id: null,
  });

  console.log(
    `🔐 Seguridad lista: ${PERMISOS.length} permisos, rol ${ROL_ADMINISTRADOR} sincronizado` +
      (vinculosReparados > 0 ? `, ${vinculosReparados} vínculo(s) reparado(s)` : '')
  );

  if (sinRol > 0) {
    console.warn(
      `⚠️  ${sinRol} usuario(s) de ámbito mayorista no tienen rol asignado y no pueden operar.` +
        '\n   Si son cuentas anteriores al módulo de seguridad: npm run migrate:roles' +
        '\n   Si les quitaron el rol a propósito: asignarles uno desde la sección Seguridad.'
    );
  }
};

module.exports = { bootstrapSeguridad };
