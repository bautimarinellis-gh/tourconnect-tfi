const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');

/**
 * Resuelve ids de negocio y nombre desde Mayorista/Agencia por usuario_id.
 * @param {import('mongoose').Document} usuario
 * @returns {Promise<{ mayorista_id: ObjectId|null, agencia_id: ObjectId|null, nombre: string|null }>}
 */
async function resolverContextoPersona(usuario) {
  let mayorista_id = null;
  let agencia_id = null;
  let nombre = null;
  let telefono = null;

  if (usuario.rol === 'mayorista') {
    // Un mayorista puede tener varios usuarios internos, y esos no tienen
    // Persona propia. El vínculo con el tenant sale de Usuario.mayorista_id;
    // el findOne por usuario_id queda como fallback para usuarios anteriores
    // al backfill (ver seeds/backfillUsuarioMayorista.js).
    const mayorista = usuario.mayorista_id
      ? await Mayorista.findById(usuario.mayorista_id)
          .select('_id activo nombre telefono usuario_id')
          .lean()
      : await Mayorista.findOne({ usuario_id: usuario._id })
          .select('_id activo nombre telefono usuario_id')
          .lean();

    if (mayorista) {
      mayorista_id = mayorista._id;
      // El dueño original muestra los datos de la empresa; los usuarios
      // internos muestran los suyos.
      const esDuenio =
        mayorista.usuario_id?.toString() === usuario._id.toString();
      nombre = esDuenio ? mayorista.nombre : (usuario.nombre ?? null);
      telefono = esDuenio ? mayorista.telefono : null;
    }
    return { mayorista_id, agencia_id, nombre, telefono, persona: mayorista };
  }

  if (usuario.rol === 'agencia') {
    const agencia = await Agencia.findOne({ usuario_id: usuario._id })
      .select('_id mayorista_id activo nombre telefono')
      .lean();
    if (agencia) {
      agencia_id = agencia._id;
      mayorista_id = agencia.mayorista_id;
      nombre = agencia.nombre;
      telefono = agencia.telefono;
    }
    return { mayorista_id, agencia_id, nombre, telefono, persona: agencia };
  }

  return { mayorista_id, agencia_id, nombre, telefono, persona: null };
}

/**
 * Construye payload de usuario para respuestas API y JWT.
 *
 * @param {Set<string>|string[]} [permisos] Códigos de permiso efectivos. Se
 *   incluyen para que el frontend pueda decidir qué mostrar; el control real
 *   lo hace el backend en cada request, esto es solo UX.
 */
function enriquecerUsuario(usuario, contexto, permisos) {
  const json = usuario.toJSON ? usuario.toJSON() : { ...usuario };
  return {
    ...json,
    nombre: contexto.nombre,
    telefono: contexto.telefono,
    mayorista_id: contexto.mayorista_id,
    agencia_id: contexto.agencia_id,
    permisos: permisos ? [...permisos] : [],
  };
}

module.exports = { resolverContextoPersona, enriquecerUsuario };
