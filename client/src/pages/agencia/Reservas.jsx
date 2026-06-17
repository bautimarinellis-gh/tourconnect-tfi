import React, { useState, useEffect } from 'react';
import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, formatDate, formatEstadoReserva } from '../../utils/formatters';
import reservaService from '../../services/reservaService';

export const AgenciaReservas = () => {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');

  useEffect(() => {
    const doFetch = async () => {
      setLoading(true);
      try {
        const data = await reservaService.getAll(filtroEstado ? { estado: filtroEstado } : {});
        setReservas(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    doFetch();
  }, [filtroEstado]);

  if (loading && reservas.length === 0) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mis Reservas</h1>
      </div>

      <div style={{ marginBottom: '2rem', maxWidth: '300px' }}>
        <Select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          options={[
            { label: 'Todos los estados', value: '' },
            { label: 'Pendiente de Pago', value: 'pendiente_pago' },
            { label: 'Pago Informado', value: 'pago_informado' },
            { label: 'Pagada', value: 'pagada' },
            { label: 'Cerrada', value: 'cerrada' },
            { label: 'Cancelada', value: 'cancelada' },
          ]}
        />
      </div>

      {reservas.length === 0 ? (
        <EmptyState title="Sin reservas" description="No hay reservas que mostrar." />
      ) : (
        <Card>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>ID / Alta</TableCell>
                <TableCell isHeader>Producto</TableCell>
                <TableCell isHeader>Fechas</TableCell>
                <TableCell isHeader>Pasajeros</TableCell>
                <TableCell isHeader>Total</TableCell>
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
                    <Link to={`/agencia/reservas/${r._id}`}>
                      <Button variant="ghost" size="sm"><Eye size={16} /> Ver detalles</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
};
