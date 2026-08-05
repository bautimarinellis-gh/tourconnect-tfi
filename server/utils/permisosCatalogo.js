/**
 * Catálogo de permisos del sistema.
 *
 * Es la fuente de verdad: el seed lo usa para poblar la colección Permiso y
 * los middlewares lo usan para validar códigos. Agregar un permiso acá y
 * volver a correr `npm run seed:seguridad`.
 */

const MODULOS = {
  AGENCIAS: 'Agencias',
  PRODUCTOS: 'Productos',
  COTIZACIONES: 'Cotizaciones',
  RESERVAS: 'Reservas',
  REPORTES: 'Reportes',
  AUDITORIA: 'Auditoría',
  SEGURIDAD: 'Seguridad',
};

/**
 * Un permiso por módulo: quien lo tiene, ve el módulo y opera dentro de él.
 *
 * No hay permisos de solo lectura por módulo. Separar "ver" de "gestionar"
 * generaba combinaciones sin sentido — dar `GestionarAgencias` sin
 * `VerAgencias` habilitaba a administrar una sección que no se podía abrir — y
 * obligaba a marcar dos casillas para el caso normal.
 *
 * Reportes y Auditoría son la excepción aparente: siguen empezando con `Ver`
 * porque son módulos de consulta y no existe nada que gestionar en ellos, no
 * porque sean la mitad de lectura de un par.
 *
 * El módulo Seguridad no es delegable: su único permiso, `GestionarRoles`, no
 * se ofrece nunca (ver abajo), así que administrar usuarios y roles queda
 * reservado al rol Administrador.
 */
const PERMISOS = [
  { codigo: 'GestionarAgencias',     modulo: MODULOS.AGENCIAS,     descripcion: 'Ver agencias, crearlas, editarlas, invitarlas y definir sus márgenes' },
  { codigo: 'GestionarProductos',    modulo: MODULOS.PRODUCTOS,    descripcion: 'Ver el catálogo y crear, editar o eliminar productos' },
  { codigo: 'GestionarCotizaciones', modulo: MODULOS.COTIZACIONES, descripcion: 'Ver cotizaciones y responderlas' },
  { codigo: 'GestionarReservas',     modulo: MODULOS.RESERVAS,     descripcion: 'Ver reservas, cambiar su estado y confirmar o rechazar pagos' },
  { codigo: 'VerReportes',           modulo: MODULOS.REPORTES,     descripcion: 'Ver y exportar reportes' },
  { codigo: 'VerAuditoria',          modulo: MODULOS.AUDITORIA,    descripcion: 'Consultar el registro de auditoría' },
  { codigo: 'GestionarRoles',        modulo: MODULOS.SEGURIDAD,    descripcion: 'Administrar usuarios, roles y permisos' },
];

/**
 * Permisos que NUNCA se ofrecen como opción asignable.
 *
 * `GestionarRoles` es el permiso que sostiene la protección del rol
 * Administrador: si se pudiera elegir al componer un rol personalizado o al
 * asignar permisos individuales, un mayorista podría dárselo a otro usuario
 * por una vía alternativa y esquivar esa protección. Al no ofrecerse nunca,
 * la única forma de tenerlo es a través del rol Administrador, que es
 * protegido y no asignable.
 *
 * Desde que absorbió la gestión de usuarios, esto también implica que dar de
 * alta usuarios y asignarles roles no se puede delegar: es potestad exclusiva
 * del Administrador del mayorista.
 *
 * Esto se valida en el backend, no solo en la UI: filtrar en el frontend
 * sería esquivable con una llamada directa a la API.
 */
const PERMISOS_NO_ASIGNABLES = ['GestionarRoles'];

const CODIGOS_VALIDOS = new Set(PERMISOS.map((p) => p.codigo));

/** Nombre del rol protegido que el super-admin asigna al crear un mayorista. */
const ROL_ADMINISTRADOR = 'Administrador';

const esAsignable = (codigo) =>
  CODIGOS_VALIDOS.has(codigo) && !PERMISOS_NO_ASIGNABLES.includes(codigo);

module.exports = {
  MODULOS,
  PERMISOS,
  PERMISOS_NO_ASIGNABLES,
  CODIGOS_VALIDOS,
  ROL_ADMINISTRADOR,
  esAsignable,
};
