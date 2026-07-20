import React, { useState, useEffect } from 'react';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReservasTable } from '../../components/shared/ReservasTable';
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
        <ReservasTable reservas={reservas} basePath="/agencia/reservas" />
      )}
    </div>
  );
};
