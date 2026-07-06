import { useState, useEffect } from 'react';
import auditoriaService from '../services/auditoriaService';

const FILTROS_INICIALES = {
  accion: '',
  categoria: '',
  resultado: '',
};

export function useAuditoria() {
  const [logs, setLogs] = useState([]);
  const [paginacion, setPaginacion] = useState({ total: 0, pagina: 1, limite: 25, paginas: 1 });
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { page, limit: 25 };
        if (filtros.accion)     params.accion     = filtros.accion;
        if (filtros.categoria)  params.categoria  = filtros.categoria;
        if (filtros.resultado)  params.resultado  = filtros.resultado;

        const data = await auditoriaService.getAll(params);
        if (!cancelled) {
          setLogs(data?.logs ?? []);
          setPaginacion(data?.paginacion ?? { total: 0, pagina: 1, limite: 25, paginas: 1 });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message ?? 'Error al cargar la auditoría.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    return () => { cancelled = true; };
  }, [page, filtros]);

  const actualizarFiltro = (key, value) => {
    setPage(1);
    setFiltros(prev => ({ ...prev, [key]: value }));
  };

  const limpiarFiltros = () => {
    setPage(1);
    setFiltros(FILTROS_INICIALES);
  };

  return {
    logs,
    paginacion,
    page,
    setPage,
    filtros,
    actualizarFiltro,
    limpiarFiltros,
    loading,
    error,
  };
}
