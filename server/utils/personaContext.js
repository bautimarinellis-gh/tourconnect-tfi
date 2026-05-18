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

  if (usuario.rol === 'mayorista') {
    const mayorista = await Mayorista.findOne({ usuario_id: usuario._id })
      .select('_id activo nombre')
      .lean();
    if (mayorista) {
      mayorista_id = mayorista._id;
      nombre = mayorista.nombre;
    }
    return { mayorista_id, agencia_id, nombre, persona: mayorista };
  }

  if (usuario.rol === 'agencia') {
    const agencia = await Agencia.findOne({ usuario_id: usuario._id })
      .select('_id mayorista_id activo nombre')
      .lean();
    if (agencia) {
      agencia_id = agencia._id;
      mayorista_id = agencia.mayorista_id;
      nombre = agencia.nombre;
    }
    return { mayorista_id, agencia_id, nombre, persona: agencia };
  }

  return { mayorista_id, agencia_id, nombre, persona: null };
}

/**
 * Construye payload de usuario para respuestas API y JWT.
 */
function enriquecerUsuario(usuario, contexto) {
  const json = usuario.toJSON ? usuario.toJSON() : { ...usuario };
  return {
    ...json,
    nombre: contexto.nombre,
    mayorista_id: contexto.mayorista_id,
    agencia_id: contexto.agencia_id,
  };
}

module.exports = { resolverContextoPersona, enriquecerUsuario };
