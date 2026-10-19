import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReservasTable } from '../../components/shared/ReservasTable';
import { Paginador } from '../../components/ui/Paginador';
import reservaService from '../../services/reservaService';

const TAMANO_PAGINA = 20;

export const MayoristaReservas = () => {
  const [searchParams] = useSearchParams();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState(searchParams.get('estado') ?? '');
  const [filtroAgencia, setFiltroAgencia] = useState('');
  // La búsqueda por agencia la resuelve el servidor (con paginación el
  // navegador solo tiene la página actual); se espera a que se deje de tipear.
  const [busquedaAgencia, setBusquedaAgencia] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusquedaAgencia(filtroAgencia.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filtroAgencia]);

  useEffect(() => {
    const doFetch = async () => {
      setLoading(true);
      try {
        const { items, pagination: pag } = await reservaService.getPagina({
          page,
          limit: TAMANO_PAGINA,
          ...(filtroEstado && { estado: filtroEstado }),
          ...(busquedaAgencia && { buscar_agencia: busquedaAgencia }),
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
  }, [filtroEstado, busquedaAgencia, page]);

  // Spinner de página solo en la primera carga: después, filtrar o paginar
  // no debe desmontar los filtros (se perdería el foco del buscador).
  if (loading && pagination === null) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Administrar Reservas</h1>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', maxWidth: '700px' }}>
        <div style={{ flex: '0 0 220px' }}>
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
        busquedaAgencia ? (
          <EmptyState title="Sin resultados" description={`No hay reservas de agencias que contengan "${busquedaAgencia}".`} />
        ) : (
          <EmptyState title="No hay reservas" description="No se encontraron reservas con los filtros actuales." />
        )
      ) : (
        <>
          <ReservasTable reservas={reservas} basePath="/mayorista/reservas" showAgenciaColumn />
          <Paginador pagination={pagination} onPageChange={setPage} loading={loading} etiquetas={['reserva', 'reservas']} />
        </>
      )}
    </div>
  );
};
