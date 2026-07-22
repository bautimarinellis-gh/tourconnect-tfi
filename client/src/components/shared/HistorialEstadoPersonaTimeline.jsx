import React from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { formatDateTime } from '../../utils/formatters';

const MOTIVOS_LABEL = {
  incumplimiento_pago: 'Incumplimiento de pago',
  incumplimiento_terminos: 'Incumplimiento de términos y condiciones',
  inactividad: 'Inactividad prolongada',
  solicitud_agencia: 'Solicitud de la propia agencia',
  solicitud_mayorista: 'Solicitud del propio mayorista',
  otro: 'Otro',
};

/**
 * Timeline de activaciones/desactivaciones de una Agencia o Mayorista.
 * Compartido entre el detalle de agencia (mayorista) y el panel de mayoristas (admin).
 */
export const HistorialEstadoPersonaTimeline = ({ historial, title = 'Historial de Estado' }) => (
  <Card>
    <CardHeader><h3>{title}</h3></CardHeader>
    <CardBody>
      {(!historial || historial.length === 0) ? (
        <p style={{ color: 'var(--color-text-soft)', margin: 0 }}>Todavía no hay cambios de estado registrados.</p>
      ) : (
        <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '7px', width: '2px', backgroundColor: 'var(--color-border)' }}></div>
          {historial.map((h) => {
            const activado = h.estado_nuevo === true;
            return (
              <div key={h._id} style={{ position: 'relative', marginBottom: '1.5rem' }}>
                <div style={{
                  position: 'absolute', left: '-1.5rem', width: '16px', height: '16px', borderRadius: '50%',
                  backgroundColor: activado ? 'var(--color-success)' : 'var(--color-error)',
                  border: '4px solid var(--color-surface)',
                }}></div>
                <div style={{ fontWeight: 600 }}>{activado ? 'Cuenta reactivada' : 'Cuenta desactivada'}</div>
                {!activado && h.motivo && (
                  <div style={{ fontSize: '0.8125rem', marginTop: '0.125rem' }}>
                    <strong>Motivo:</strong> {MOTIVOS_LABEL[h.motivo] || h.motivo}
                  </div>
                )}
                {!activado && h.motivo_mensaje && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', fontStyle: 'italic', marginTop: '0.125rem' }}>
                    {h.motivo_mensaje}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', marginTop: '0.125rem' }}>
                  {formatDateTime(h.created_at)}{h.usuario_id?.email ? ` — por ${h.usuario_id.email}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CardBody>
  </Card>
);
