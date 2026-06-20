import React from 'react';
import { Badge } from './Badge';
import { formatDateTime } from '../../utils/formatters';
import { ACCION_LABELS } from '../../utils/auditoriaConstants';
import './auditEventDetail.css';

const renderScalar = (val) => {
  if (val === null || val === undefined) return <span className="aud-null">—</span>;
  if (typeof val === 'boolean')
    return <span className={val ? 'aud-bool-true' : 'aud-bool-false'}>{val ? 'true' : 'false'}</span>;
  if (typeof val === 'object') return <span className="aud-json">{JSON.stringify(val)}</span>;
  return <span>{String(val)}</span>;
};

const DiffView = ({ before, after }) => {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return (
    <div className="aud-diff">
      <div className="aud-diff-head">
        <span className="aud-diff-key-col" />
        <span>Antes</span>
        <span>Después</span>
      </div>
      {keys.map(key => {
        const changed = JSON.stringify((before ?? {})[key]) !== JSON.stringify((after ?? {})[key]);
        return (
          <div key={key} className={`aud-diff-row${changed ? ' aud-diff-changed' : ''}`}>
            <span className="aud-diff-key">{key}</span>
            <span className="aud-diff-before">{renderScalar((before ?? {})[key])}</span>
            <span className="aud-diff-after">{renderScalar((after ?? {})[key])}</span>
          </div>
        );
      })}
    </div>
  );
};

const FlatDetail = ({ obj }) => (
  <dl className="aud-flat">
    {Object.entries(obj).map(([key, val]) => (
      <div key={key} className="aud-flat-row">
        <dt>{key}</dt>
        <dd>{typeof val === 'object' && val !== null
          ? <pre className="aud-pre">{JSON.stringify(val, null, 2)}</pre>
          : renderScalar(val)}
        </dd>
      </div>
    ))}
  </dl>
);

const DetailSection = ({ title, children }) => (
  <div className="aud-section">
    <p className="aud-section-title">{title}</p>
    {children}
  </div>
);

export const AuditEventDetail = ({ log }) => {
  if (!log) return null;

  const hasDiff = log.detalle && 'before' in log.detalle && 'after' in log.detalle;
  const hasDetalle = log.detalle !== null && log.detalle !== undefined;

  return (
    <div className="aud-detail">

      {/* Badges de acción */}
      <div className="aud-badges">
        <Badge variant={log.categoria === 'seguridad' ? 'warning' : 'info'}>
          {log.categoria}
        </Badge>
        <Badge variant={log.resultado === 'exitoso' ? 'success' : 'error'}>
          {log.resultado}
        </Badge>
      </div>

      {/* Nombre de acción + timestamp */}
      <p className="aud-accion-label">
        {ACCION_LABELS[log.accion] ?? log.accion}
      </p>
      <p className="aud-timestamp">{formatDateTime(log.timestamp)}</p>

      {/* Actor */}
      <DetailSection title="Actor">
        <div className="aud-grid">
          <div className="aud-grid-item">
            <span className="aud-grid-label">Usuario</span>
            <span className="aud-grid-value">{log.usuario_id?.email ?? <span className="aud-null">Desconocido</span>}</span>
          </div>
          {log.usuario_id?.rol && (
            <div className="aud-grid-item">
              <span className="aud-grid-label">Rol</span>
              <span className="aud-grid-value">{log.usuario_id.rol}</span>
            </div>
          )}
          {log.mayorista_id?.nombre && (
            <div className="aud-grid-item">
              <span className="aud-grid-label">Mayorista</span>
              <span className="aud-grid-value">{log.mayorista_id.nombre}</span>
            </div>
          )}
          {log.agencia_id?.nombre && (
            <div className="aud-grid-item">
              <span className="aud-grid-label">Agencia</span>
              <span className="aud-grid-value">{log.agencia_id.nombre}</span>
            </div>
          )}
          <div className="aud-grid-item">
            <span className="aud-grid-label">IP</span>
            <span className="aud-grid-value aud-mono">{log.ip_address ?? '—'}</span>
          </div>
          {log.user_agent && (
            <div className="aud-grid-item aud-grid-full">
              <span className="aud-grid-label">Navegador / Cliente</span>
              <span className="aud-grid-value aud-user-agent">{log.user_agent}</span>
            </div>
          )}
        </div>
      </DetailSection>

      {/* Entidad afectada */}
      {log.entidad_afectada && (
        <DetailSection title="Entidad afectada">
          <div className="aud-grid">
            <div className="aud-grid-item">
              <span className="aud-grid-label">Modelo</span>
              <span className="aud-grid-value">{log.entidad_afectada}</span>
            </div>
            {log.entidad_id && (
              <div className="aud-grid-item">
                <span className="aud-grid-label">ID</span>
                <span className="aud-grid-value aud-mono aud-id">{String(log.entidad_id)}</span>
              </div>
            )}
          </div>
        </DetailSection>
      )}

      {/* Detalle */}
      {hasDetalle && (
        <DetailSection title="Detalle del evento">
          {hasDiff
            ? <DiffView before={log.detalle.before} after={log.detalle.after} />
            : <FlatDetail obj={log.detalle} />
          }
        </DetailSection>
      )}
    </div>
  );
};
