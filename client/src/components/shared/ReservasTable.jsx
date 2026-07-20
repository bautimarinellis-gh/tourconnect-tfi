import React from 'react';
import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Table, TableRow, TableCell } from '../ui/Table';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatCurrency, formatDate, formatEstadoReserva } from '../../utils/formatters';

/**
 * Tabla de listado de reservas, compartida entre mayorista y agencia.
 * `showAgenciaColumn` agrega la columna "Agencia" (solo tiene sentido
 * para el mayorista, que ve reservas de todas sus agencias).
 */
export const ReservasTable = ({ reservas, basePath, showAgenciaColumn = false }) => (
  <Card>
    <Table>
      <thead>
        <TableRow>
          <TableCell isHeader>ID / Alta</TableCell>
          <TableCell isHeader>Producto</TableCell>
          {showAgenciaColumn && <TableCell isHeader>Agencia</TableCell>}
          <TableCell isHeader>Fechas</TableCell>
          <TableCell isHeader>Pasajeros</TableCell>
          <TableCell isHeader>{showAgenciaColumn ? 'Precio Final' : 'Total'}</TableCell>
          <TableCell isHeader>Estado</TableCell>
          <TableCell isHeader>Acciones</TableCell>
        </TableRow>
      </thead>
      <tbody>
        {reservas.map(r => (
          <TableRow key={r._id}>
            <TableCell>
              <div style={{ fontWeight: 600 }}>#{r._id.slice(-6).toUpperCase()}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)' }}>
                {formatDate(r.created_at)}
              </div>
            </TableCell>
            <TableCell>
              <div style={{ fontWeight: 500 }}>{r.producto_id?.nombre || 'Producto'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-soft)', textTransform: 'capitalize' }}>
                {r.producto_id?.tipo}
              </div>
            </TableCell>
            {showAgenciaColumn && <TableCell>{r.agencia_id?.nombre || 'N/A'}</TableCell>}
            <TableCell>
              <div style={{ fontSize: '0.875rem' }}>
                {formatDate(r.fecha_inicio)} — {formatDate(r.fecha_fin)}
              </div>
            </TableCell>
            <TableCell>{r.pasajeros}</TableCell>
            <TableCell>
              <div style={{ fontWeight: 600 }}>{formatCurrency(r.precio_final)}</div>
            </TableCell>
            <TableCell>
              <Badge variant={r.estado}>{formatEstadoReserva(r.estado)}</Badge>
            </TableCell>
            <TableCell>
              <Link to={`${basePath}/${r._id}`}>
                <Button variant="ghost" size="sm"><Eye size={16} /> Ver detalles</Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  </Card>
);
