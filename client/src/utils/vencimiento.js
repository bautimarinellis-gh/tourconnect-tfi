// El servidor calcula cuándo vence cada cotización (vence_at): una pendiente
// si el mayorista no la responde, una aprobada si la agencia no confirma la
// reserva a tiempo. Acá solo se calcula el tiempo que queda.
export const getVencimientoInfo = (cotizacion) => {
  if (!cotizacion?.vence_at) return null;
  const expira = new Date(cotizacion.vence_at);
  const diffMs = expira - Date.now();
  const diffHs = Math.floor(diffMs / 3600000);
  return { expira, diffHs, vencido: diffMs <= 0 };
};
