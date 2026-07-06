import React, { useState, useEffect } from 'react';
import { Eye, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, formatDate, formatEstadoReserva } from '../../utils/formatters';
import reservaService from '../../services/reservaService';

export const MayoristaReservas = () => {
  const [searchParams] = useSearchParams();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState(searchParams.get('estado') ?? '');
  const [filtroAgencia, setFiltroAgencia] = useState('');

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

  const reservasFiltradas = reservas.filter(r => {
    if (filtroAgencia.trim()) {
      const nombre = r.agencia_id?.nombre?.toLowerCase() ?? '';
      if (!nombre.includes(filtroAgencia.toLowerCase())) return false;
    }
    return true;
  });

  if (loading && reservas.length === 0) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Administrar Reservas</h1>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', maxWidth: '700px' }}>
        <div style={{ flex: '0 0 220px' }}>
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
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)', pointerEvents: 'none' }} />
          <input
            type="text"
            aria-label="Buscar por agencia"
            placeholder="Buscar por agencia..."
            value={filtroAgencia}
            onChange={e => setFiltroAgencia(e.target.value)}
            className="input-control"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
      </div>

      {reservas.length === 0 ? (
        <EmptyState title="No hay reservas" description="No se encontraron reservas con los filtros actuales." />
      ) : reservasFiltradas.length === 0 ? (
        <EmptyState title="Sin resultados" description={`No hay reservas de agencias que contengan "${filtroAgencia}".`} />
      ) : (
        <Card>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>ID / Alta</TableCell>
                <TableCell isHeader>Producto</TableCell>
                <TableCell isHeader>Agencia</TableCell>
                <TableCell isHeader>Fechas</TableCell>
                <TableCell isHeader>Pasajeros</TableCell>
                <TableCell isHeader>Precio Final</TableCell>
                <TableCell isHeader>Estado</TableCell>
                <TableCell isHeader>Acciones</TableCell>
              </TableRow>
            </thead>
            <tbody>
              {reservasFiltradas.map(r => (
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
                  <TableCell>{r.agencia_id?.nombre || 'N/A'}</TableCell>
                  <TableCell>
                    <div style={{ fontSize: '0.875rem' }}>
                      {formatDate(r.fecha_inicio)} — {formatDate(r.fecha_fin)}
                    </div>
                  </TableCell>
                  <TableCell>{r.pasajeros}</TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 600 }}>
                      {formatCurrency(r.precio_final)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.estado}>{formatEstadoReserva(r.estado)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link to={`/mayorista/reservas/${r._id}`}>
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
