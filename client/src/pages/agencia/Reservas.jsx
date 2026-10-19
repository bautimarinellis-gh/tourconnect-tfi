import React, { useState, useEffect } from 'react';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReservasTable } from '../../components/shared/ReservasTable';
import { Paginador } from '../../components/ui/Paginador';
import reservaService from '../../services/reservaService';

const TAMANO_PAGINA = 20;

export const AgenciaReservas = () => {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    const doFetch = async () => {
      setLoading(true);
      try {
        const { items, pagination: pag } = await reservaService.getPagina({
          page,
          limit: TAMANO_PAGINA,
          ...(filtroEstado && { estado: filtroEstado }),
        });
        setReservas(items);
        setPagination(pag);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    doFetch();
  }, [filtroEstado, page]);

  // Spinner de página solo en la primera carga: después, filtrar o paginar
  // no debe desmontar los filtros (se perdería el foco del buscador).
  if (loading && pagination === null) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mis Reservas</h1>
      </div>

      <div style={{ marginBottom: '2rem', maxWidth: '300px' }}>
        <Select
          value={filtroEstado}
          onChange={e => { setFiltroEstado(e.target.value); setPage(1); }}
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
        <>
          <ReservasTable reservas={reservas} basePath="/agencia/reservas" />
          <Paginador pagination={pagination} onPageChange={setPage} loading={loading} etiquetas={['reserva', 'reservas']} />
        </>
      )}
    </div>
  );
};
