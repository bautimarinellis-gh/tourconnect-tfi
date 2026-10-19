/**
 * Paginación opcional de listados.
 *
 * Si la request no manda `page`, el listado se devuelve completo como antes:
 * así los consumidores que necesitan todo (dashboards, filtros locales) no
 * cambian. Con `page`, se devuelve una página y los totales para el paginador.
 */

const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 100;

/** @returns {{ page: number, limit: number, skip: number } | null} */
const leerPaginacion = (query = {}) => {
  if (query.page === undefined) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(LIMITE_MAXIMO, Math.max(1, parseInt(query.limit, 10) || LIMITE_POR_DEFECTO));
  return { page, limit, skip: (page - 1) * limit };
};

/** Bloque `pagination` de la respuesta. */
const describirPagina = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = { leerPaginacion, describirPagina, LIMITE_MAXIMO };
