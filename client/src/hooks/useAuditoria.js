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
  // Trazabilidad: al fijarse, reemplaza los filtros de arriba y muestra la
  // vida completa de una entidad puntual (ver construirQueryAuditoria en el
  // backend). null = modo normal ("mi actividad").
  const [trazabilidad, setTrazabilidad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [esTrazabilidadEntidad, setEsTrazabilidadEntidad] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = trazabilidad
          ? { entidad_afectada: trazabilidad.entidad_afectada, entidad_id: trazabilidad.entidad_id }
          : { page, limit: 25, ...filtros };
        if (!trazabilidad) {
          if (!params.accion) delete params.accion;
          if (!params.categoria) delete params.categoria;
          if (!params.resultado) delete params.resultado;
        }

        const data = await auditoriaService.getAll(params);
        if (!cancelled) {
          setLogs(data?.logs ?? []);
          setPaginacion(data?.paginacion ?? { total: 0, pagina: 1, limite: 25, paginas: 1 });
          setEsTrazabilidadEntidad(Boolean(data?.esTrazabilidadEntidad));
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
  }, [page, filtros, trazabilidad]);

  const actualizarFiltro = (key, value) => {
    setPage(1);
    setFiltros(prev => ({ ...prev, [key]: value }));
  };

  const limpiarFiltros = () => {
    setPage(1);
    setFiltros(FILTROS_INICIALES);
  };

  const verTrazabilidad = (entidad_afectada, entidad_id) => {
    setTrazabilidad({ entidad_afectada, entidad_id });
  };

  const salirDeTrazabilidad = () => {
    setTrazabilidad(null);
    setPage(1);
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
    trazabilidad,
    esTrazabilidadEntidad,
    verTrazabilidad,
    salirDeTrazabilidad,
  };
}
