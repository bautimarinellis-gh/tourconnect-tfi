import React from 'react';
import { Lock } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { usePermiso } from '../../hooks/usePermiso';

/**
 * Bloqueo de contenido por falta de permisos.
 *
 * El ítem del menú sigue visible a propósito: en este alcance el enforcement
 * es por contenido, no por ocultamiento del sidebar. Que la sección exista
 * pero esté bloqueada también le dice a la persona a quién pedirle acceso.
 */
export const SinPermiso = ({ mensaje }) => (
  <EmptyState
    icon={<Lock size={48} className="empty-state-icon" />}
    title="No tenés acceso a esta sección"
    description={
      mensaje ||
      'Tu rol no incluye los permisos necesarios. Si necesitás entrar, pedíselo al administrador de tu empresa.'
    }
  />
);

/**
 * Renderiza el contenido solo si el usuario tiene alguno de los permisos; si
 * no, muestra el bloqueo. Es la unidad de enforcement del frontend en este
 * alcance.
 *
 * Uso: <ConPermiso codigo="VerReportes"><Reportes /></ConPermiso>
 */
export const ConPermiso = ({ codigo, children }) => {
  const codigos = Array.isArray(codigo) ? codigo : [codigo];
  const permitido = usePermiso(codigos);
  return permitido ? children : <SinPermiso />;
};
