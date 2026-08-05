import {
  ClipboardList,
  FileBarChart,
  FileText,
  LayoutDashboard,
  Lock,
  Package,
  ShieldCheck,
  Users,
} from 'lucide-react';

/**
 * Navegación del ámbito mayorista — fuente única de la relación
 * sección ↔ permiso.
 *
 * La consumen dos lugares con propósitos distintos:
 *  - Navbar, para no mostrar lo que el usuario no puede usar (UX).
 *  - App.jsx, para bloquear el contenido si igual llega por URL (seguridad).
 *
 * Tenerlo en un solo lado evita que el menú y el bloqueo se desincronicen y
 * queden secciones visibles pero muertas, o al revés.
 *
 * `permiso: null` significa que la sección no exige permiso.
 * `permiso` con varios códigos: alcanza con tener alguno.
 */
export const NAV_MAYORISTA = [
  // El Dashboard no exige permiso: es la home, todos tienen que poder
  // aterrizar en algún lado después del login.
  { name: 'Dashboard',    path: '/mayorista/dashboard',    icon: LayoutDashboard, permiso: null },
  { name: 'Agencias',     path: '/mayorista/agencias',     icon: Users,           permiso: 'GestionarAgencias' },
  { name: 'Productos',    path: '/mayorista/productos',    icon: Package,         permiso: 'GestionarProductos' },
  { name: 'Cotizaciones', path: '/mayorista/cotizaciones', icon: FileText,        permiso: 'GestionarCotizaciones' },
  { name: 'Reservas',     path: '/mayorista/reservas',     icon: ClipboardList,   permiso: 'GestionarReservas' },
  { name: 'Reportes',     path: '/mayorista/reportes',     icon: FileBarChart,    permiso: 'VerReportes' },
  { name: 'Auditoría',    path: '/mayorista/auditoria',    icon: ShieldCheck,     permiso: 'VerAuditoria' },
  // Seguridad no es delegable: GestionarRoles solo lo tiene el Administrador.
  { name: 'Seguridad',    path: '/mayorista/seguridad',    icon: Lock,            permiso: 'GestionarRoles' },
];

/**
 * Permiso que exige cada sección, indexado por el último tramo de la ruta.
 * Lo usa App.jsx, que además tiene rutas de detalle (`agencias/:id`) que no
 * son ítems de menú pero heredan el permiso de su sección.
 */
export const PERMISO_POR_SECCION = Object.fromEntries(
  NAV_MAYORISTA.filter(item => item.permiso).map(item => [
    item.path.split('/').pop(),
    item.permiso,
  ])
);

/** ¿El usuario tiene acceso a este ítem de navegación? */
export const tieneAcceso = (permiso, permisosUsuario = []) => {
  if (!permiso) return true;
  const codigos = Array.isArray(permiso) ? permiso : [permiso];
  return codigos.some(codigo => permisosUsuario.includes(codigo));
};

/** Ítems del menú que el usuario puede ver, en orden. */
export const navegacionVisible = (permisosUsuario = []) =>
  NAV_MAYORISTA.filter(item => tieneAcceso(item.permiso, permisosUsuario));
