import {
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  LayoutDashboard,
  Lock,
  Map,
  Package,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';

/**
 * Etiquetas de los grupos del menú. Un ítem con `grupo: null` se muestra
 * suelto, sin encabezado (es el caso del Dashboard, que es la home).
 */
const ETIQUETA_GRUPO = {
  operacion: 'Operación',
  administracion: 'Administración',
  control: 'Control',
};

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
  { name: 'Dashboard', path: '/mayorista/dashboard', icon: LayoutDashboard, permiso: null, grupo: null },
  { name: 'Cotizaciones', path: '/mayorista/cotizaciones', icon: FileText, permiso: 'GestionarCotizaciones', grupo: 'operacion' },
  { name: 'Reservas', path: '/mayorista/reservas', icon: ClipboardList, permiso: 'GestionarReservas', grupo: 'operacion' },
  { name: 'Agencias', path: '/mayorista/agencias', icon: Users, permiso: 'GestionarAgencias', grupo: 'administracion' },
  { name: 'Productos', path: '/mayorista/productos', icon: Package, permiso: 'GestionarProductos', grupo: 'administracion' },
  { name: 'Reportes', path: '/mayorista/reportes', icon: FileBarChart, permiso: 'VerReportes', grupo: 'control' },
  { name: 'Auditoría', path: '/mayorista/auditoria', icon: ShieldCheck, permiso: 'VerAuditoria', grupo: 'control' },
  // Seguridad no es delegable: GestionarRoles solo lo tiene el Administrador.
  { name: 'Seguridad', path: '/mayorista/seguridad', icon: Lock, permiso: 'GestionarRoles', grupo: 'control' },
];

/**
 * Admin gestiona la plataforma, no un tenant. Reusa las etiquetas de grupo del
 * mayorista para que el menú se lea igual al cambiar de rol: "Mayoristas" ocupa
 * el lugar que allá ocupa "Agencias" (las entidades que uno administra) y
 * "Auditoría" cae en Control, igual que en los otros dos roles.
 *
 * Quedan grupos de una sola sección. Es a propósito: pesa más la consistencia
 * entre roles que ahorrar dos encabezados.
 */
export const NAV_ADMIN = [
  { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, permiso: null, grupo: null },
  { name: 'Mayoristas', path: '/admin/mayoristas', icon: Building2, permiso: null, grupo: 'administracion' },
  { name: 'Auditoría', path: '/admin/auditoria', icon: ShieldCheck, permiso: null, grupo: 'control' },
];

/**
 * La agencia no tiene permisos granulares todavía: ve siempre las mismas
 * secciones. Igual declara `permiso: null` para que el armado del menú sea
 * el mismo código que el del mayorista.
 */
export const NAV_AGENCIA = [
  { name: 'Dashboard', path: '/agencia/dashboard', icon: LayoutDashboard, permiso: null, grupo: null },
  { name: 'Catálogo', path: '/agencia/catalogo', icon: Map, permiso: null, grupo: 'operacion' },
  { name: 'Cotizaciones', path: '/agencia/cotizaciones', icon: ShoppingBag, permiso: null, grupo: 'operacion' },
  { name: 'Reservas', path: '/agencia/reservas', icon: ClipboardList, permiso: null, grupo: 'operacion' },
  { name: 'Auditoría', path: '/agencia/auditoria', icon: ShieldCheck, permiso: null, grupo: 'control' },
];

const NAV_POR_ROL = {
  admin: NAV_ADMIN,
  mayorista: NAV_MAYORISTA,
  agencia: NAV_AGENCIA,
};

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

/**
 * Menú del rol, filtrado por permisos y partido en grupos.
 *
 * Devuelve `[{ id, label, items }]`. El grupo se arma recorriendo los ítems
 * visibles en orden y cortando cuando cambia `grupo`, así que un grupo cuyos
 * ítems quedaron todos filtrados no se crea nunca: no hay encabezados
 * huérfanos para un mayorista con permisos recortados.
 *
 * Como el corte es por tramos, los ítems de un mismo grupo tienen que estar
 * declarados juntos en el array. Si se separan, aparece el encabezado repetido.
 *
 * `label` es null para el grupo suelto (`grupo: null`), que se renderiza sin
 * encabezado.
 */
export const navegacionAgrupada = (rol, permisosUsuario = []) => {
  const visibles = (NAV_POR_ROL[rol] ?? []).filter(item =>
    tieneAcceso(item.permiso, permisosUsuario)
  );

  return visibles.reduce((grupos, item) => {
    const id = item.grupo ?? null;
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && ultimo.id === id) {
      ultimo.items.push(item);
    } else {
      grupos.push({ id, label: id ? ETIQUETA_GRUPO[id] : null, items: [item] });
    }

    return grupos;
  }, []);
};
