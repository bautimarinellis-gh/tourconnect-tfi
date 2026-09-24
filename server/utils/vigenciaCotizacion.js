/**
 * Vigencia de las cotizaciones: cuánto tiempo puede quedar una cotización
 * esperando al siguiente paso antes de vencer sola.
 *
 *  - pendiente: el mayorista tiene N horas desde que se creó para responder.
 *  - aprobada:  la agencia tiene N horas desde la aprobación para confirmar
 *               la reserva, y nunca más allá del día de inicio del viaje.
 *
 * Mientras una cotización aprobada está vigente retiene cupo (ver
 * cupoValidator). Sin este vencimiento, una aprobación que la agencia nunca
 * convierte en reserva bloquearía esos lugares hasta la fecha del viaje.
 *
 * Este módulo es la única fuente de la regla: lo usan el cron de vencimiento,
 * el virtual `vence_at` del modelo (que es lo que muestra el frontend), el
 * validador de cupo y la creación de reservas.
 */

const HORAS_POR_DEFECTO = 72;
const MS_POR_HORA = 60 * 60 * 1000;
const MS_POR_DIA = 24 * MS_POR_HORA;

/** Horas de vigencia, configurables con COTIZACION_EXPIRA_HORAS. */
const horasVigencia = () => {
  const horas = Number(process.env.COTIZACION_EXPIRA_HORAS);
  return Number.isFinite(horas) && horas > 0 ? horas : HORAS_POR_DEFECTO;
};

/**
 * Referencia desde la que corre el plazo de una aprobada. Las aprobadas
 * anteriores a que existiera `aprobada_at` usan `updated_at`: la aprobación
 * fue su última modificación.
 */
const inicioPlazoAprobada = (cotizacion) => cotizacion.aprobada_at || cotizacion.updated_at;

/**
 * Instante en que vence la cotización, o null si su estado no vence.
 * @returns {Date|null}
 */
const calcularVencimiento = (cotizacion) => {
  if (!cotizacion) return null;
  const plazoMs = horasVigencia() * MS_POR_HORA;

  if (cotizacion.estado === 'pendiente' && cotizacion.created_at) {
    return new Date(new Date(cotizacion.created_at).getTime() + plazoMs);
  }

  if (cotizacion.estado === 'aprobada') {
    const inicio = inicioPlazoAprobada(cotizacion);
    if (!inicio) return null;
    const porPlazo = new Date(inicio).getTime() + plazoMs;
    // Se puede reservar hasta el mismo día de inicio del viaje, inclusive.
    const porViaje = cotizacion.fecha_inicio
      ? new Date(cotizacion.fecha_inicio).getTime() + MS_POR_DIA
      : Infinity;
    return new Date(Math.min(porPlazo, porViaje));
  }

  return null;
};

/** ¿La cotización sigue vigente en `ahora`? Los estados que no vencen, siempre. */
const estaVigente = (cotizacion, ahora = new Date()) => {
  const vence = calcularVencimiento(cotizacion);
  return vence === null || vence > ahora;
};

module.exports = {
  HORAS_POR_DEFECTO,
  horasVigencia,
  calcularVencimiento,
  estaVigente,
};
