import React from 'react';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { formatDateTime, formatEstadoReserva } from '../../utils/formatters';

/**
 * Timeline de cambios de estado de una reserva.
 * Compartido entre las vistas de detalle de mayorista y agencia.
 */
export const ReservaTimeline = ({ historial, title = 'Historial de Estados' }) => (
  <Card>
    <CardHeader><h3>{title}</h3></CardHeader>
    <CardBody>
      <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '7px', width: '2px', backgroundColor: 'var(--color-border)' }}></div>
        {(historial ?? []).map((h) => (
          <div key={h._id} style={{ position: 'relative', marginBottom: '1.5rem' }}>
            <div style={{ position: 'absolute', left: '-1.5rem', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', border: '4px solid var(--color-surface)' }}></div>
            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{formatEstadoReserva(h.estado_nuevo)}</div>
            {h.comentario && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', fontStyle: 'italic', marginTop: '0.1rem' }}>{h.comentario}</div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>{formatDateTime(h.created_at)}</div>
          </div>
        ))}
      </div>
    </CardBody>
  </Card>
);
