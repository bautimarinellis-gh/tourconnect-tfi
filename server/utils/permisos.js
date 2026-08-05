const { PERMISOS } = require('./permisosCatalogo');

/**
 * Resuelve los permisos efectivos de un usuario.
 *
 *   permisos efectivos = permisos del rol ∪ permisos individuales
 *
 * No hay lógica allow/deny: los permisos solo suman. Un caso donde alguien
 * necesita "menos" que su rol se resuelve componiendo un rol más angosto, no
 * restando permisos.
 *
 * Espera un documento de Usuario con `rol_id` y `permisos_individuales` ya
 * populados (lo hace authMiddleware en el mismo query con el que revalida la
 * cuenta, para no agregar un round-trip por request).
 *
 * Los permisos NO viajan en el JWT a propósito: el token dura 7 días y
 * revocar un permiso tardaría hasta una semana en surtir efecto. Se resuelven
 * contra la base en cada request, igual que el flag `activo`.
 *
 * @param {import('mongoose').Document} usuarioDoc
 * @returns {Promise<Set<string>>} códigos de permiso
 */
const resolverPermisosEfectivos = async (usuarioDoc) => {
  // El super-admin de la plataforma queda fuera del sistema de permisos: no
  // pertenece a ningún mayorista y es quien crea a los Administradores, así
  // que no hay nadie que pudiera asignarle permisos. Se le devuelve el
  // catálogo completo para que los call sites no tengan que conocer el caso
  // especial.
  if (usuarioDoc.rol === 'admin') {
    return new Set(PERMISOS.map((p) => p.codigo));
  }

  const codigos = new Set();

  // Composite: el rol delega en sus hijos vía obtenerPermisos().
  if (usuarioDoc.rol_id) {
    const permisosDelRol = await usuarioDoc.rol_id.obtenerPermisos();
    for (const permiso of permisosDelRol) {
      // Una referencia a un permiso borrado se popula como null. El bootstrap
      // limpia esos casos al arrancar, pero si uno se cuela conviene ignorarlo
      // en vez de tirar abajo la request entera.
      if (permiso?.codigo) codigos.add(permiso.codigo);
    }
  }

  // Permisos sueltos: la otra rama del Composite, tratada igual que el rol.
  for (const permiso of usuarioDoc.permisos_individuales ?? []) {
    if (!permiso) continue;
    for (const hoja of permiso.obtenerPermisos()) {
      if (hoja?.codigo) codigos.add(hoja.codigo);
    }
  }

  return codigos;
};

module.exports = { resolverPermisosEfectivos };
