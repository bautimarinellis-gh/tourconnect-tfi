import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantChat } from './AssistantChat';
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
 * Sin gate por permiso por ahora: lo usan el mayorista y los sub-mayoristas
 * (cualquier usuario del tenant), igual que cuando vivía en el Dashboard.
 * Para restringirlo a futuro alcanza con envolver <MayoristaAssistant /> en
 * <ConPermiso codigo="..."> desde App.jsx, sin tocar este componente.
 *
 * El aislamiento por tenant es 100% server-side (assistantRoute + middleware
 * tenant): el front solo manda el texto de la consulta.
 */
export function MayoristaAssistant() {
  const [open, setOpen] = useState(false);

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
