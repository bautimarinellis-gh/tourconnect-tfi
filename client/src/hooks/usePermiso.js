import { useAuth } from './useAuth';

/**
 * Permisos efectivos del usuario logueado.
 *
 * Esto es solo UX: sirve para no mostrar lo que la persona no puede usar. El
 * control real lo hace el backend en cada request, así que un frontend
 * manipulado no habilita nada.
 */
export const usePermisos = () => {
  const { user } = useAuth();
  return user?.permisos ?? [];
};

/**
 * ¿El usuario tiene alguno de los permisos indicados?
 *
 * Uso: usePermiso('VerReportes')
 *      usePermiso('GestionarReservas', 'GestionarRoles')
 */
export const usePermiso = (...codigos) => {
  const permisos = usePermisos();
  return codigos.flat().some((codigo) => permisos.includes(codigo));
};
