import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getVencimientoInfo } from '../../utils/vencimiento';

/** "Vence en Xh" (resaltado si queda menos de un día) o "Vence en Xd". */
export const VencimientoCotizacion = ({ cotizacion }) => {
  const v = getVencimientoInfo(cotizacion);
  if (!v || v.vencido) return null;
  if (v.diffHs < 24) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 600, marginTop: '0.25rem' }}
        title={`Vence el ${v.expira.toLocaleString()}`}
      >
        <AlertTriangle size={12} aria-hidden="true" /> Vence en {Math.max(v.diffHs, 1)}h
      </div>
    );
  }
  return (
    <div
      style={{ fontSize: '0.7rem', color: 'var(--color-text-soft)', marginTop: '0.25rem' }}
      title={`Vence el ${v.expira.toLocaleString()}`}
    >
      Vence en {Math.ceil(v.diffHs / 24)}d
    </div>
  );
};
