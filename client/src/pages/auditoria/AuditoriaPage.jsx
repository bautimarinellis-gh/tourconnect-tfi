import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { AuditEventDetail } from '../../components/ui/AuditEventDetail';
import { ACCION_LABELS, ACCIONES_POR_ROL } from '../../utils/auditoriaConstants';
import { useAuditoria } from '../../hooks/useAuditoria';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../utils/formatters';
import './auditoria.css';

// ── Helpers de presentación ──────────────────────────────────────
const truncateId = (id) => id ? String(id).slice(-8) : null;

const ResultadoBadge = ({ resultado }) => (
  <Badge variant={resultado === 'exitoso' ? 'success' : 'error'}>
    {resultado === 'exitoso' ? 'Exitoso' : 'Fallido'}
  </Badge>
);

const CategoriaBadge = ({ categoria }) => (
  <Badge variant={categoria === 'seguridad' ? 'warning' : 'info'}>
    {categoria}
  </Badge>
);

// ── Componente principal ─────────────────────────────────────────
export const AuditoriaPage = ({ title }) => {
  const { logs, paginacion, page, setPage, filtros, actualizarFiltro, limpiarFiltros, loading, error } = useAuditoria();
  const { user } = useAuth();
  const [selectedLog, setSelectedLog] = useState(null);

  const accionesPorCategoria = ACCIONES_POR_ROL[user?.rol] ?? ACCIONES_POR_ROL.agencia;

  const tieneFiltrosActivos = Object.values(filtros).some(Boolean);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
      </div>

      {/* ── Filtros ── */}
      <div className="audit-filters">

        <div className="audit-filter-field audit-filter-field--accion">
          <label className="audit-filter-label">Acción</label>
          <select
            className="input-control"
            value={filtros.accion}
            onChange={e => actualizarFiltro('accion', e.target.value)}
          >
            <option value="">Todas las acciones</option>
            <optgroup label="Seguridad">
              {accionesPorCategoria.seguridad.map(a => (
                <option key={a} value={a}>{ACCION_LABELS[a]}</option>
              ))}
            </optgroup>
            <optgroup label="Negocio">
              {accionesPorCategoria.negocio.map(a => (
                <option key={a} value={a}>{ACCION_LABELS[a]}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label">Categoría</label>
          <select
            className="input-control"
            value={filtros.categoria}
            onChange={e => actualizarFiltro('categoria', e.target.value)}
          >
            <option value="">Todas</option>
            <option value="seguridad">Seguridad</option>
            <option value="negocio">Negocio</option>
          </select>
        </div>

        <div className="audit-filter-field">
          <label className="audit-filter-label">Resultado</label>
          <select
            className="input-control"
            value={filtros.resultado}
            onChange={e => actualizarFiltro('resultado', e.target.value)}
          >
            <option value="">Todos</option>
            <option value="exitoso">Exitoso</option>
            <option value="fallido">Fallido</option>
          </select>
        </div>

        {tieneFiltrosActivos && (
          <div className="audit-filter-field">
            <label className="audit-filter-label">&nbsp;</label>
            <Button variant="secondary" size="sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <Alert variant="error">{error}</Alert>
      )}

      {/* ── Tabla ── */}
      {loading && logs.length === 0 ? (
        <Spinner center size="lg" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={48} className="empty-state-icon" />}
          title="Sin eventos de auditoría"
          description={tieneFiltrosActivos ? 'Ningún evento coincide con los filtros aplicados.' : 'Todavía no se registraron eventos.'}
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <TableCell isHeader>Fecha / Hora</TableCell>
                <TableCell isHeader>Acción</TableCell>
                <TableCell isHeader>Resultado</TableCell>
                <TableCell isHeader>Entidad</TableCell>
                <TableCell isHeader>IP</TableCell>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <TableRow key={log._id} onClick={() => setSelectedLog(log)}>
                  <TableCell style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
                    {formatDateTime(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <div className="audit-accion-cell">
                      <span className="audit-accion-label">{ACCION_LABELS[log.accion] ?? log.accion}</span>
                      <CategoriaBadge categoria={log.categoria} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <ResultadoBadge resultado={log.resultado} />
                  </TableCell>
                  <TableCell>
                    {log.entidad_afectada ? (
                      <div className="audit-entidad">
                        <div>{log.entidad_afectada}</div>
                        {log.entidad_id && (
                          <div className="audit-entidad-id">#{truncateId(log.entidad_id)}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="audit-ip">{log.ip_address ?? '—'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>

          {/* ── Paginación ── */}
          <div className="audit-pagination">
            <span className="audit-pagination-info">
              {paginacion.total} evento{paginacion.total !== 1 ? 's' : ''} en total
            </span>
            <div className="audit-pagination-controls">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => p - 1)}
              >
                ← Anterior
              </Button>
              <span className="audit-page-indicator">
                Página {paginacion.pagina} de {paginacion.paginas}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= paginacion.paginas || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal de detalle ── */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? (ACCION_LABELS[selectedLog.accion] ?? selectedLog.accion) : ''}
        className="audit-modal"
      >
        <AuditEventDetail log={selectedLog} />
      </Modal>
    </div>
  );
};
