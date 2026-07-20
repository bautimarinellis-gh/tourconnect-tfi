import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Alert } from '../ui/Alert';
import { formatCurrency, formatDate, formatEstadoCotizacion } from '../../utils/formatters';

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ color: 'var(--color-text-soft)' }}>{label}</span>
    {children}
  </div>
);

/**
 * Modal de detalle de una cotización, compartido entre mayorista y agencia.
 * `showAgencia` muestra el nombre de la agencia (tiene sentido para el
 * mayorista, no para la agencia viendo su propia cotización).
 * `vencimiento` es el resultado de getVencimientoInfo (solo lo calcula agencia
 * hoy, que es quien necesita saber cuánto tiempo le queda antes de que expire).
 */
export const CotizacionDetailModal = ({ isOpen, onClose, cotizacion, showAgencia = false, vencimiento = null }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Detalle de Cotización"
    footer={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}
  >
    {cotizacion && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9375rem' }}>
        <Row label="ID">
          <span style={{ fontWeight: 500 }}>#{cotizacion._id.slice(-6).toUpperCase()}</span>
        </Row>
        {showAgencia && (
          <Row label="Agencia">
            <span>{cotizacion.agencia_id?.nombre || cotizacion.agencia_id?.username || 'N/A'}</span>
          </Row>
        )}
        <Row label="Producto">
          <span>{cotizacion.producto_id?.nombre || 'N/A'}</span>
        </Row>
        <Row label="Fechas">
          <span>{formatDate(cotizacion.fecha_inicio)} — {formatDate(cotizacion.fecha_fin)}</span>
        </Row>
        <Row label="Pasajeros">
          <span>{cotizacion.pasajeros}</span>
        </Row>
        <Row label="Total">
          <span style={{ fontWeight: 600 }}>{formatCurrency(cotizacion.precio_total)}</span>
        </Row>
        <Row label="Estado">
          <Badge variant={cotizacion.estado}>{formatEstadoCotizacion(cotizacion.estado)}</Badge>
        </Row>
        {vencimiento && !vencimiento.vencido && (
          <Row label="Vencimiento">
            <span style={{ color: vencimiento.diffHs < 24 ? 'var(--color-warning)' : 'var(--color-text-soft)', fontWeight: vencimiento.diffHs < 24 ? 600 : 400 }}>
              {vencimiento.diffHs < 24 ? `⚠ En ${vencimiento.diffHs}h` : `En ${Math.ceil(vencimiento.diffHs / 24)}d`}
            </span>
          </Row>
        )}
        {cotizacion.motivo_rechazo && (
          <div style={{ marginTop: '0.25rem' }}>
            <Alert variant="error">
              <strong>Motivo de rechazo:</strong> {cotizacion.motivo_rechazo}
            </Alert>
          </div>
        )}
      </div>
    )}
  </Modal>
);
