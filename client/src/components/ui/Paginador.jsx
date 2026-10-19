import React from 'react';
import { Button } from './Button';
import './paginador.css';

/**
 * Controles de paginación para listados paginados por el servidor.
 * `pagination` es el bloque que devuelve la API: { page, limit, total, pages }.
 */
export const Paginador = ({ pagination, onPageChange, loading = false, etiquetas = ['resultado', 'resultados'] }) => {
  if (!pagination) return null;
  const { page, pages, total } = pagination;

  return (
    <div className="paginador">
      <span className="paginador-info">
        {total} {total === 1 ? etiquetas[0] : etiquetas[1]} en total
      </span>
      {pages > 1 && (
        <div className="paginador-controles">
          <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
            ← Anterior
          </Button>
          <span className="paginador-indicador">Página {page} de {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)}>
            Siguiente →
          </Button>
        </div>
      )}
    </div>
  );
};
