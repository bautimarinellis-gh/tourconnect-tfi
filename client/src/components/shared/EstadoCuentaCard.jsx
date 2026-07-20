import React from 'react';
import { Card, CardBody } from '../ui/Card';
import { formatCurrency } from '../../utils/formatters';

/**
 * Card de "Estado de Cuenta" (total / abonado / saldo) de una reserva.
 * Compartido entre las vistas de detalle de mayorista y agencia.
 * `showAbonado` se omite del lado de agencia: solo ve el mayorista
 * registra pagos parciales, la agencia ve el saldo consolidado.
 */
export const EstadoCuentaCard = ({ totalLabel = 'Total:', precioFinal, totalPagado, saldo, showAbonado = false }) => (
  <Card style={{ marginBottom: '1.5rem', borderColor: 'var(--color-primary)' }}>
    <CardBody>
      <h3 style={{ margin: '0 0 1rem 0' }}>Estado de Cuenta</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: showAbonado ? '0.5rem' : '1rem' }}>
        <span style={{ color: 'var(--color-text-soft)' }}>{totalLabel}</span>
        <span style={{ fontWeight: 600 }}>{formatCurrency(precioFinal)}</span>
      </div>
      {showAbonado && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--color-text-soft)' }}>Abonado:</span>
          <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{formatCurrency(totalPagado)}</span>
        </div>
      )}
      <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Saldo Pendiente:</span>
        <span style={{ fontWeight: 700, fontSize: '1.25rem', color: saldo > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
          {formatCurrency(saldo)}
        </span>
      </div>
    </CardBody>
  </Card>
);
