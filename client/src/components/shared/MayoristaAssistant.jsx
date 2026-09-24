import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantChat } from './AssistantChat';
import { usePermiso } from '../../hooks/usePermiso';
import { PERMISOS_ASISTENTE } from '../../config/navegacion';
import './assistant.css';

/**
 * Widget flotante del Asistente Inteligente — ámbito mayorista.
 *
 * Se monta al nivel de la ruta `/mayorista/*` (ver App.jsx), fuera del
 * <Routes> interno: así no se re-monta al cambiar de sección y tanto la
 * conversación como el estado abierto/cerrado sobreviven la navegación.
 *
 * El launcher y el panel se renderizan siempre (se ocultan con `hidden`,
 * no se desmontan): minimizar no debe borrar la conversación en curso.
 *
 * Cada intención del asistente exige el mismo permiso que la sección
 * equivalente del sistema (ver `permiso` en server/utils/intentCatalog.js).
 * Si el usuario no tiene ninguno, el botón no se muestra.
 *
 * El aislamiento por tenant es 100% server-side (assistantRoute + middleware
 * tenant): el front solo manda el texto de la consulta.
 */
export function MayoristaAssistant() {
  const [open, setOpen] = useState(false);
  const habilitado = usePermiso(PERMISOS_ASISTENTE);

  if (!habilitado) return null;

  return (
    <>
      <button
        type="button"
        className="assistant-launcher"
        hidden={open}
        onClick={() => setOpen(true)}
        title="Consultá tus datos"
        aria-label="Abrir asistente para consultar tus datos"
      >
        <span className="assistant-launcher-icon">
          <Sparkles size={20} />
        </span>
        <span className="assistant-launcher-label">Consultá tus datos</span>
      </button>

      <div
        className="assistant-panel"
        hidden={!open}
        role="dialog"
        aria-label="Asistente Inteligente"
      >
        <AssistantChat floating onCollapse={() => setOpen(false)} />
      </div>
    </>
  );
}
