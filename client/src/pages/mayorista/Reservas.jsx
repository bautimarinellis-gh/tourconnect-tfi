import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReservasTable } from '../../components/shared/ReservasTable';
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
        <ReservasTable reservas={reservasFiltradas} basePath="/mayorista/reservas" showAgenciaColumn />
      )}
    </div>
  );
};
