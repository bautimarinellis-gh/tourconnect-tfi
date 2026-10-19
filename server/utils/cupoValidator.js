const Cotizacion = require('../models/Cotizacion');
const Producto = require('../models/Producto');
const Reserva = require('../models/Reserva');
const { estaVigente } = require('./vigenciaCotizacion');
const { toDateString, sumarDias } = require('./dateHelpers');

/**
 * Cupo de plazas por producto.
 *
 * `cupo_maximo` son plazas (pasajeros) por día: por noche en un hotel, por día
 * en una actividad y por día de viaje en un paquete. Las plazas libres de un
 * rango son el cupo menos el pico de ocupación diaria dentro de ese rango:
 * dos estadías que no se pisan entre sí no se suman aunque las dos caigan en
 * el rango consultado.
 *
 * Un producto sin `cupo_maximo` (alta anterior a que fuera obligatorio para
 * todos los tipos) no tiene límite.
 */

const SIN_LIMITE = '9999-12-31';

/**
 * Días (YYYY-MM-DD) que ocupa una estadía o servicio según el tipo:
 *  - actividad: solo el día de inicio;
 *  - hotel:     las noches, de inicio a fin sin incluir el día de salida;
 *  - paquete:   todos los días del viaje, inclusive.
 */
function diasOcupados(tipo, fechaInicio, fechaFin) {
  const inicio = toDateString(fechaInicio);
  if (!inicio) return [];
  if (tipo === 'actividad') return [inicio];

  const fin = toDateString(fechaFin) || inicio;
  const ultimo = tipo === 'hotel' ? sumarDias(fin, -1) : fin;
  const dias = [];
  for (let dia = inicio; dia <= ultimo; dia = sumarDias(dia, 1)) dias.push(dia);
  return dias;
}

/**
 * ¿La cotización ocupa cupo?
 *  - las aprobadas todavía vigentes (la agencia puede confirmarlas en
 *    cualquier momento dentro de su plazo);
 *  - las que generaron una reserva, salvo que esa reserva se haya cancelado.
 *
 * La cotización de una reserva cancelada sigue en `reserva_generada` (su
 * historia no cambia), así que no alcanza con mirar su estado: la reserva es
 * la única fuente de verdad sobre si el lugar sigue tomado.
 *
 * @param {Set<string>} idsConReservaCancelada ids de cotización cuya reserva se canceló
 */
function esCompromisoActivo(c, idsConReservaCancelada, ahora = new Date()) {
  if (c.estado === 'aprobada') return estaVigente(c, ahora);
  if (c.estado === 'reserva_generada') return !idsConReservaCancelada.has(String(c._id));
  return false;
}

/** Pasajeros de las cotizaciones que ocupan cupo (sin mirar fechas). */
function contarPasajerosComprometidos(solapadas, idsConReservaCancelada, ahora = new Date()) {
  return solapadas.reduce(
    (total, c) => (esCompromisoActivo(c, idsConReservaCancelada, ahora) ? total + c.pasajeros : total),
    0
  );
}

/**
 * Pico de ocupación diaria entre `desde` y `hasta` (YYYY-MM-DD, inclusive).
 * Función pura: recibe compromisos ya filtrados por esCompromisoActivo.
 * @returns {{ pico: number, dia_pico: string|null }}
 */
function picoOcupacion(compromisos, tipo, desde, hasta) {
  const porDia = new Map();
  for (const c of compromisos) {
    for (const dia of diasOcupados(tipo, c.fecha_inicio, c.fecha_fin)) {
      if (dia < desde || dia > hasta) continue;
      porDia.set(dia, (porDia.get(dia) || 0) + c.pasajeros);
    }
  }

  let pico = 0;
  let dia_pico = null;
  for (const [dia, pasajeros] of porDia) {
    if (pasajeros > pico || (pasajeros === pico && dia_pico && dia < dia_pico)) {
      pico = pasajeros;
      dia_pico = dia;
    }
  }
  return { pico, dia_pico };
}

/**
 * Cotizaciones del producto que ocupan cupo en algún día entre `desde` y
 * `hasta` (YYYY-MM-DD, inclusive).
 */
async function buscarCompromisos(productoId, desde, hasta, { excluirId, session, ahora = new Date() } = {}) {
  const filtro = {
    producto_id: productoId,
    estado: { $in: ['aprobada', 'reserva_generada'] },
    fecha_inicio: { $lte: new Date(hasta) },
    fecha_fin: { $gte: new Date(desde) },
  };
  if (excluirId) filtro._id = { $ne: excluirId };

  const candidatas = await Cotizacion.find(filtro).session(session || null);

  const idsReservadas = candidatas
    .filter((c) => c.estado === 'reserva_generada')
    .map((c) => c._id);

  const idsConReservaCancelada = new Set(
    idsReservadas.length === 0
      ? []
      : (await Reserva.find({ cotizacion_id: { $in: idsReservadas }, estado: 'cancelada' })
        .session(session || null)
        .distinct('cotizacion_id')).map(String)
  );

  return candidatas.filter((c) => esCompromisoActivo(c, idsConReservaCancelada, ahora));
}

/**
 * Plazas libres de un producto para una estadía o servicio.
 *
 * @param {object} producto documento de Producto (tipo, cupo_maximo, _id)
 * @param {Date|string} fechaInicio
 * @param {Date|string} fechaFin
 * @returns {Promise<{ ilimitado: boolean, cupo_maximo: number|null, comprometidas: number, disponibles: number|null, dia_pico: string|null }>}
 */
async function calcularDisponibilidad(producto, fechaInicio, fechaFin, opts = {}) {
  if (!producto.cupo_maximo) {
    return { ilimitado: true, cupo_maximo: null, comprometidas: 0, disponibles: null, dia_pico: null };
  }

  const dias = diasOcupados(producto.tipo, fechaInicio, fechaFin);
  if (dias.length === 0) {
    return { ilimitado: false, cupo_maximo: producto.cupo_maximo, comprometidas: 0, disponibles: producto.cupo_maximo, dia_pico: null };
  }

  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const compromisos = await buscarCompromisos(producto._id, desde, hasta, opts);
  const { pico, dia_pico } = picoOcupacion(compromisos, producto.tipo, desde, hasta);

  return {
    ilimitado: false,
    cupo_maximo: producto.cupo_maximo,
    comprometidas: pico,
    disponibles: Math.max(producto.cupo_maximo - pico, 0),
    dia_pico,
  };
}

/** Mensaje único para "no alcanza el cupo", al cotizar y al aprobar. */
function mensajeSinCupo(pasajeros, disponibilidad) {
  return `No hay cupo suficiente para esas fechas: se solicitan ${pasajeros} pasajeros y quedan ${disponibilidad.disponibles} de ${disponibilidad.cupo_maximo} plazas disponibles.`;
}

/**
 * Verifica que `cotizacion` entre en el cupo del producto, sin contarse a sí
 * misma. Se usa al crear la cotización y, dentro de la transacción, al
 * aprobarla.
 */
async function verificarCupoDisponible(cotizacion, { session, producto } = {}) {
  const prod = producto || await Producto.findById(cotizacion.producto_id).session(session || null);
  if (!prod) return { ok: true };

  const disponibilidad = await calcularDisponibilidad(prod, cotizacion.fecha_inicio, cotizacion.fecha_fin, {
    excluirId: cotizacion._id,
    session,
  });

  if (!disponibilidad.ilimitado && cotizacion.pasajeros > disponibilidad.disponibles) {
    return { ok: false, message: mensajeSinCupo(cotizacion.pasajeros, disponibilidad), disponibilidad };
  }

  return { ok: true, disponibilidad };
}

/**
 * Pico de plazas comprometidas desde `desde` en adelante: es el mínimo al
 * que puede bajar el cupo de un producto sin dejar ventas afuera.
 */
async function picoComprometidoDesde(producto, desde) {
  const compromisos = await buscarCompromisos(producto._id, desde, SIN_LIMITE);
  return picoOcupacion(compromisos, producto.tipo, desde, SIN_LIMITE);
}

/**
 * Compromisos con algún día de hoy en adelante fuera del rango [desde, hasta]
 * de disponibilidad (los días ya pasados no cuentan). Si hay alguno, achicar la
 * disponibilidad del producto a ese rango dejaría ventas afuera.
 */
async function compromisosFueraDeRango(producto, desde, hasta, hoy) {
  const compromisos = await buscarCompromisos(producto._id, hoy, SIN_LIMITE);
  return compromisos.filter((c) =>
    diasOcupados(producto.tipo, c.fecha_inicio, c.fecha_fin)
      .some((dia) => dia >= hoy && (dia < desde || dia > hasta))
  );
}

module.exports = {
  diasOcupados,
  esCompromisoActivo,
  contarPasajerosComprometidos,
  picoOcupacion,
  calcularDisponibilidad,
  verificarCupoDisponible,
  picoComprometidoDesde,
  compromisosFueraDeRango,
};
