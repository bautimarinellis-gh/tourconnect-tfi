/**
 * Constructor de consultas del Asistente Inteligente.
 *
 * Recibe una consulta YA VALIDADA por piezasConsulta.validarConsulta() y arma
 * la agregación de MongoDB que la responde.
 *
 * SEGURIDAD MULTI-TENANT:
 *  - El mayorista_id llega del middleware (req.mayorista_id), nunca de la IA
 *    ni del texto del usuario.
 *  - Toda agregación EMPIEZA con $match por mayorista_id, agregado acá por
 *    código. Las uniones con otras colecciones se filtran de nuevo por tenant.
 *  - Los nombres que escribe el usuario (filtro por agencia o producto) se
 *    buscan dentro del tenant y como texto literal.
 *
 * Límites: máximo 20 filas (24 en la evolución mensual) y maxTimeMS por
 * agregación, para que una combinación pesada no bloquee el servidor.
 */

const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Agencia = require('../models/Agencia');
const Producto = require('../models/Producto');
const Pago = require('../models/Pago');
const { cotizacionCollection, productoCollection } = require('./reporteHelpers');
const { getDateRange, describirPeriodo } = require('./queryExecutor');
const { MESES, hoyAR } = require('./fechasAR');
const { hoyDateString } = require('./dateHelpers');
const { FUENTES, METRICAS, AGRUPACIONES } = require('./piezasConsulta');

const MAX_TIME_MS = 5000;
const MAX_MESES_SERIE = 24;
const MAX_COINCIDENCIAS_NOMBRE = 5;
const DIA_MS = 24 * 60 * 60 * 1000;
const OFFSET_AR_MS = 3 * 60 * 60 * 1000;
const TZ_AR = 'America/Argentina/Buenos_Aires';

const ESTADOS_INGRESO = ['pago_informado', 'pagada', 'cerrada'];

const ETIQUETAS_ESTADO = {
  reservas: {
    pendiente_pago: 'Pendiente de pago', pago_informado: 'Pago informado',
    pagada: 'Pagada', cerrada: 'Cerrada', cancelada: 'Cancelada',
  },
  cotizaciones: {
    pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
    vencida: 'Vencida', cancelada: 'Cancelada', reserva_generada: 'Reserva generada',
  },
  pagos: {
    por_confirmar: 'Por confirmar', confirmado: 'Confirmado',
    rechazado: 'Rechazado', anulado: 'Anulado',
  },
};
const ETIQUETAS_TIPO = { hotel: 'Hotel', actividad: 'Actividad', paquete: 'Paquete' };
const ETIQUETAS_METODO = {
  transferencia: 'Transferencia', efectivo: 'Efectivo', cheque: 'Cheque',
  mercadopago: 'Mercado Pago', otro: 'Otro',
};
const MESES_CORTOS = MESES.map((m) => m.slice(0, 3));
const SINGULAR = { reservas: 'reserva', cotizaciones: 'cotización', pagos: 'pago' };

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

/** Ejecuta una agregación con tiempo máximo. */
function agregar(Model, pipeline) {
  const agg = Model.aggregate(pipeline);
  return typeof agg?.option === 'function' ? agg.option({ maxTimeMS: MAX_TIME_MS }) : agg;
}

/** Decimal128 / número / null → número. */
function aNumero(valor) {
  if (valor === null || valor === undefined) return 0;
  const n = valor instanceof mongoose.Types.Decimal128 ? parseFloat(valor.toString()) : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

const redondear = (n, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

// Mismo formato que el resto del sistema (Reportes, PDF): dólares, en-US
const formatoMoneda = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatearValor(valor, tipo) {
  if (valor === null || valor === undefined) return '-';
  if (tipo === 'moneda') return formatoMoneda.format(Number(valor));
  if (tipo === 'porcentaje') return `${Number(valor).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  if (typeof valor === 'number') return valor.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(valor);
}

function formatearVariacion(pct) {
  if (pct === null || pct === undefined) return 'sin datos del período anterior';
  if (pct === 0) return 'sin cambios';
  const signo = pct > 0 ? '▲' : '▼';
  return `${signo} ${Math.abs(pct).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

/** Texto literal para una regex (el nombre lo escribió el usuario). */
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fecha dd/mm/aaaa. Las de viaje son de calendario (medianoche UTC). */
function formatearFecha(fecha, calendario) {
  if (!fecha) return '-';
  return new Date(fecha).toLocaleDateString('es-AR', {
    timeZone: calendario ? 'UTC' : TZ_AR, day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ─────────────────────────────────────────────
// Períodos
// ─────────────────────────────────────────────

/**
 * Rango de un período sobre la fecha de viaje (fecha_inicio de la
 * cotización). Esas fechas son de calendario, guardadas a medianoche UTC, así
 * que los cortes también van a medianoche UTC del día argentino. Además, los
 * períodos "en curso" se toman completos (el mes entero, no hasta hoy): un
 * viaje de fin de mes pertenece a "este mes" aunque todavía no llegó.
 */
function rangoViaje(periodo, now) {
  const { y, m, d, dow } = hoyAR(now);
  const dia = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd));
  const { time_range: tr, days, months, month, year } = periodo;
  const lunes = d - ((dow + 6) % 7);
  const trimestre = m - (m % 3);

  switch (tr) {
    case 'today':           return [dia(y, m, d), dia(y, m, d + 1)];
    case 'yesterday':       return [dia(y, m, d - 1), dia(y, m, d)];
    case 'last_n_days':     return [dia(y, m, d - (days - 1)), dia(y, m, d + 1)];
    case 'last_30_days':    return [dia(y, m, d - 29), dia(y, m, d + 1)];
    case 'last_week':       return [dia(y, m, lunes - 7), dia(y, m, lunes)];
    case 'current_month':   return [dia(y, m, 1), dia(y, m + 1, 1)];
    case 'last_month':      return [dia(y, m - 1, 1), dia(y, m, 1)];
    case 'last_n_months':   return [dia(y, m - months, d + 1), dia(y, m, d + 1)];
    case 'current_quarter': return [dia(y, trimestre, 1), dia(y, trimestre + 3, 1)];
    case 'last_quarter':    return [dia(y, trimestre - 3, 1), dia(y, trimestre, 1)];
    case 'current_year':    return [dia(y, 0, 1), dia(y + 1, 0, 1)];
    case 'last_year':       return [dia(y - 1, 0, 1), dia(y, 0, 1)];
    case 'specific_month':  return [dia(year, month - 1, 1), dia(year, month, 1)];
    case 'next_n_days':     return [dia(y, m, d), dia(y, m, d + days)];
    case 'next_week':       return [dia(y, m, lunes + 7), dia(y, m, lunes + 14)];
    case 'next_month':      return [dia(y, m + 1, 1), dia(y, m + 2, 1)];
    case 'all_time':        return [null, null];
    default:                return [dia(y, m, d - 29), dia(y, m, d + 1)];
  }
}

/**
 * Rango [desde, hasta) del período. hasta = null significa "hasta ahora".
 */
function rangoPeriodo(periodo, fecha, now = new Date()) {
  if (!periodo) return { desde: null, hasta: null };
  if (fecha === 'viaje') {
    const [desde, hasta] = rangoViaje(periodo, now);
    return { desde, hasta };
  }
  if (periodo.time_range === 'all_time') return { desde: null, hasta: null };
  const { fechaDesde, fechaHasta } = getDateRange(periodo, now);
  return { desde: fechaDesde, hasta: fechaHasta };
}

/** Resta k meses a un instante, conservando el día (acotado al fin de mes). */
function restarMeses(fecha, k, calendario) {
  const offset = calendario ? 0 : OFFSET_AR_MS;
  const local = new Date(fecha.getTime() - offset);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() - k;
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const destino = Date.UTC(y, m, Math.min(local.getUTCDate(), ultimoDia),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
  return new Date(destino + offset);
}

// Cuántos meses mide un período calendario (para correrlo hacia atrás)
const MESES_PERIODO = {
  current_month: 1, last_month: 1, specific_month: 1, next_month: 1,
  current_quarter: 3, last_quarter: 3, current_year: 12, last_year: 12,
};

/**
 * Período anterior equivalente, para comparar.
 *  - Períodos calendario (mes, trimestre, año): el mismo tramo, un mes /
 *    trimestre / año antes. "Este mes" (hasta hoy) se compara con el mes
 *    pasado hasta el mismo día, para que la comparación sea justa.
 *  - Períodos en días: la misma cantidad de días inmediatamente antes.
 */
function rangoAnterior(periodo, fecha, now = new Date()) {
  const { desde, hasta } = rangoPeriodo(periodo, fecha, now);
  if (!desde) return null;
  const fin = hasta || now;
  const calendario = fecha === 'viaje';

  const meses = periodo.time_range === 'last_n_months' ? periodo.months : MESES_PERIODO[periodo.time_range];
  if (meses) {
    return { desde: restarMeses(desde, meses, calendario), hasta: restarMeses(fin, meses, calendario) };
  }
  const largo = Math.max(DIA_MS, Math.round((fin - desde) / DIA_MS) * DIA_MS);
  return { desde: new Date(desde - largo), hasta: new Date(fin - largo) };
}

/** Frase del período, lista para ir después del sujeto ("... en agosto 2026"). */
function describirPeriodoConsulta(periodo, fecha, now = new Date()) {
  if (!periodo) return '';
  const { time_range: tr, days } = periodo;
  const { y, m } = hoyAR(now);
  if (tr === 'next_n_days') return days === 1 ? 'mañana' : `en los próximos ${days} días`;
  if (tr === 'next_week') return 'la semana que viene';
  if (tr === 'next_month') {
    const sig = new Date(Date.UTC(y, m + 1, 1));
    return `en ${MESES[sig.getUTCMonth()]} ${sig.getUTCFullYear()}`;
  }
  if (fecha === 'viaje') {
    if (tr === 'current_month') return 'este mes';
    if (tr === 'current_quarter') return 'este trimestre';
    if (tr === 'current_year') return `en ${y}`;
  }
  return describirPeriodo(periodo, now);
}

const describirRango = ({ desde, hasta }, calendario) => {
  // hasta es exclusivo: se muestra el día anterior
  const ultimo = new Date(hasta.getTime() - 1);
  return `del ${formatearFecha(desde, calendario)} al ${formatearFecha(ultimo, calendario)}`;
};

/** Filtro de MongoDB para un rango, o null si no hay límites. */
function filtroRango({ desde, hasta }) {
  if (!desde && !hasta) return null;
  return { ...(desde && { $gte: desde }), ...(hasta && { $lt: hasta }) };
}

// ─────────────────────────────────────────────
// Filtros por nombre
// ─────────────────────────────────────────────

/**
 * Busca las agencias / productos que coinciden con el nombre escrito, dentro
 * del tenant. Devuelve { ids, nombres } o { aviso } si no hay coincidencias o
 * hay demasiadas.
 */
async function resolverNombre(Model, texto, mayoristaId, etiqueta) {
  const encontrados = await Model.find({
    mayorista_id: mayoristaId,
    nombre: { $regex: escaparRegex(texto), $options: 'i' },
  }).select('nombre').limit(MAX_COINCIDENCIAS_NOMBRE + 1).lean();

  if (encontrados.length === 0) {
    return { aviso: `No encontré ${etiqueta.articulo} ${etiqueta.singular} que coincida con "${texto}".` };
  }
  if (encontrados.length > MAX_COINCIDENCIAS_NOMBRE) {
    return { aviso: `Hay muchas ${etiqueta.plural} que coinciden con "${texto}". Probá con un nombre más completo.` };
  }
  return { ids: encontrados.map((e) => e._id), nombres: encontrados.map((e) => e.nombre) };
}

async function resolverFiltrosNombre(filtros, mayoristaId) {
  const res = { agencias: null, productos: null };
  if (filtros.agencia) {
    const r = await resolverNombre(Agencia, filtros.agencia, mayoristaId,
      { articulo: 'ninguna', singular: 'agencia', plural: 'agencias' });
    if (r.aviso) return r;
    res.agencias = r;
  }
  if (filtros.producto) {
    const r = await resolverNombre(Producto, filtros.producto, mayoristaId,
      { articulo: 'ningún', singular: 'producto', plural: 'productos' });
    if (r.aviso) return r;
    res.productos = r;
  }
  return res;
}

// ─────────────────────────────────────────────
// Etapas base por fuente
// ─────────────────────────────────────────────

const necesitaProducto = (c) =>
  c.filtros.tipo_producto.length > 0 || c.agrupar_por === 'tipo_producto' || c.modo === 'listado';

const lookupProducto = (campo, M) => [
  {
    $lookup: {
      from: productoCollection(),
      localField: campo,
      foreignField: '_id',
      as: 'prod',
    },
  },
  { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
  // Segunda capa de aislamiento sobre la unión
  { $match: { $or: [{ 'prod.mayorista_id': M }, { prod: { $exists: false } }] } },
];

/** Estados de reserva a considerar según filtros y métrica. */
function filtroEstadoReserva(c) {
  if (c.metrica === 'ingresos_confirmados') {
    const estados = c.filtros.estado.length
      ? c.filtros.estado.filter((e) => ESTADOS_INGRESO.includes(e))
      : ESTADOS_INGRESO;
    return { $in: estados };
  }
  if (c.filtros.estado.length) return { $in: c.filtros.estado };
  // Por defecto no se cuentan las canceladas, salvo que se agrupe por estado
  if (c.agrupar_por === 'estado' || c.modo === 'listado') return null;
  return { $ne: 'cancelada' };
}

/** Etapas de reservas: tenant primero, unión con la cotización y filtros. */
function etapasReservas(c, M, rango, nombres) {
  const matchReserva = { mayorista_id: M };
  const estado = filtroEstadoReserva(c);
  if (estado) matchReserva.estado = estado;
  if (c.fecha === 'creacion' && filtroRango(rango)) matchReserva.created_at = filtroRango(rango);
  if (nombres.agencias) matchReserva.agencia_id = { $in: nombres.agencias.ids };

  const matchCot = { 'cot.mayorista_id': M };
  if (c.fecha === 'viaje' && filtroRango(rango)) matchCot['cot.fecha_inicio'] = filtroRango(rango);
  if (nombres.productos) matchCot['cot.producto_id'] = { $in: nombres.productos.ids };

  const etapas = [
    { $match: matchReserva },
    { $lookup: { from: cotizacionCollection(), localField: 'cotizacion_id', foreignField: '_id', as: 'cot' } },
    { $unwind: '$cot' },
    { $match: matchCot },
  ];
  if (necesitaProducto(c)) {
    etapas.push(...lookupProducto('cot.producto_id', M));
    if (c.filtros.tipo_producto.length) etapas.push({ $match: { 'prod.tipo': { $in: c.filtros.tipo_producto } } });
  }
  return etapas;
}

/** Etapas de cotizaciones: tienen mayorista_id propio. */
function etapasCotizaciones(c, M, rango, nombres) {
  const match = { mayorista_id: M };
  if (c.filtros.estado.length) match.estado = { $in: c.filtros.estado };
  const campoFecha = c.fecha === 'viaje' ? 'fecha_inicio' : 'created_at';
  if (filtroRango(rango)) match[campoFecha] = filtroRango(rango);
  if (nombres.agencias) match.agencia_id = { $in: nombres.agencias.ids };
  if (nombres.productos) match.producto_id = { $in: nombres.productos.ids };

  const etapas = [{ $match: match }];
  if (necesitaProducto(c)) {
    etapas.push(...lookupProducto('producto_id', M));
    if (c.filtros.tipo_producto.length) etapas.push({ $match: { 'prod.tipo': { $in: c.filtros.tipo_producto } } });
  }
  return etapas;
}

/**
 * Etapas de pagos. El modelo Pago no tiene mayorista_id: se arranca desde las
 * reservas del tenant y se traen sus pagos. El estado del pago se deriva:
 * rechazado → "rechazado"; si no, según la reserva: pago informado → "por
 * confirmar", pagada o cerrada → "confirmado", otro → "anulado".
 */
function etapasPagos(c, M, rango, nombres) {
  const matchReserva = { mayorista_id: M };
  if (nombres.agencias) matchReserva.agencia_id = { $in: nombres.agencias.ids };

  const matchPago = {};
  if (filtroRango(rango)) matchPago['pago.created_at'] = filtroRango(rango);
  if (c.filtros.estado.length) matchPago.estado_pago = { $in: c.filtros.estado };
  if (c.filtros.metodo_pago.length) matchPago['pago.metodo'] = { $in: c.filtros.metodo_pago };

  return [
    { $match: matchReserva },
    { $lookup: { from: Pago.collection.name, localField: '_id', foreignField: 'reserva_id', as: 'pago' } },
    { $unwind: '$pago' },
    {
      $addFields: {
        estado_pago: {
          $switch: {
            branches: [
              { case: { $eq: ['$pago.rechazado', true] }, then: 'rechazado' },
              { case: { $eq: ['$estado', 'pago_informado'] }, then: 'por_confirmar' },
              { case: { $in: ['$estado', ['pagada', 'cerrada']] }, then: 'confirmado' },
            ],
            default: 'anulado',
          },
        },
      },
    },
    ...(Object.keys(matchPago).length ? [{ $match: matchPago }] : []),
  ];
}

// Campo de fecha y zona horaria para agrupar por mes
function campoFechaMes(c) {
  if (c.fuente === 'pagos') return { campo: '$pago.created_at', tz: '-03:00' };
  if (c.fecha === 'viaje') {
    return { campo: c.fuente === 'reservas' ? '$cot.fecha_inicio' : '$fecha_inicio', tz: 'UTC' };
  }
  return { campo: '$created_at', tz: '-03:00' };
}

/** Clave de agrupación de MongoDB. */
function claveAgrupacion(c) {
  const enReserva = c.fuente === 'reservas';
  switch (c.agrupar_por) {
    case 'agencia': return '$agencia_id';
    case 'producto': return enReserva ? '$cot.producto_id' : '$producto_id';
    case 'tipo_producto': return '$prod.tipo';
    case 'estado': return c.fuente === 'pagos' ? '$estado_pago' : '$estado';
    case 'metodo_pago': return '$pago.metodo';
    case 'mes': {
      const { campo, tz } = campoFechaMes(c);
      return { $dateToString: { format: '%Y-%m', date: campo, timezone: tz } };
    }
    default: return null;
  }
}

/** Acumuladores del $group según la métrica. */
function acumuladores(c) {
  const precio = c.fuente === 'reservas' ? '$cot.precio_total' : '$precio_total';
  const pax = c.fuente === 'reservas' ? '$cot.pasajeros' : '$pasajeros';
  switch (c.metrica) {
    case 'pasajeros': return { valor: { $sum: pax } };
    case 'facturacion':
    case 'ingresos_confirmados':
    case 'monto_cotizado': return { valor: { $sum: precio } };
    case 'ticket_promedio': return { valor: { $avg: precio } };
    case 'monto_pagado': return { valor: { $sum: '$pago.monto' } };
    case 'tasa_conversion': return {
      convertidas: { $sum: { $cond: [{ $eq: ['$estado', 'reserva_generada'] }, 1, 0] } },
      // Las pendientes todavía pueden convertirse: no cuentan en la base
      resueltas: { $sum: { $cond: [{ $ne: ['$estado', 'pendiente'] }, 1, 0] } },
    };
    default: return { valor: { $sum: 1 } };
  }
}

function etapasBase(c, M, rango, nombres) {
  if (c.fuente === 'reservas') return { Model: Reserva, etapas: etapasReservas(c, M, rango, nombres) };
  if (c.fuente === 'cotizaciones') return { Model: Cotizacion, etapas: etapasCotizaciones(c, M, rango, nombres) };
  return { Model: Reserva, etapas: etapasPagos(c, M, rango, nombres) };
}

/**
 * Corre la agregación agrupada. Devuelve [{ clave, valor }] con valor numérico
 * (o null en la conversión sin base).
 */
async function agruparValores(c, M, rango, nombres, { conLimite }) {
  const { Model, etapas } = etapasBase(c, M, rango, nombres);
  const pipeline = [...etapas, { $group: { _id: claveAgrupacion(c), ...acumuladores(c) } }];

  if (c.agrupar_por !== 'mes' && c.agrupar_por !== 'ninguno') {
    // La conversión se ordena después de calcularla
    if (c.metrica !== 'tasa_conversion') pipeline.push({ $sort: { valor: c.orden === 'asc' ? 1 : -1 } });
    if (conLimite && c.metrica !== 'tasa_conversion') pipeline.push({ $limit: c.limite });
  }

  const filas = await agregar(Model, pipeline);
  let valores = filas.map((f) => ({
    clave: f._id ?? null,
    valor: c.metrica === 'tasa_conversion'
      ? (f.resueltas > 0 ? redondear((f.convertidas / f.resueltas) * 100, 1) : null)
      : redondear(aNumero(f.valor)),
  }));

  if (c.metrica === 'tasa_conversion' && c.agrupar_por !== 'ninguno' && c.agrupar_por !== 'mes') {
    valores = valores
      .filter((v) => v.valor !== null)
      .sort((a, b) => (c.orden === 'asc' ? a.valor - b.valor : b.valor - a.valor));
    if (conLimite) valores = valores.slice(0, c.limite);
  }
  return valores;
}

// ─────────────────────────────────────────────
// Etiquetas de las claves agrupadas
// ─────────────────────────────────────────────

async function nombresPorId(Model, ids, M) {
  const validos = ids.filter((id) => id instanceof mongoose.Types.ObjectId);
  if (validos.length === 0) return new Map();
  const docs = await Model.find({ _id: { $in: validos }, mayorista_id: M }).select('nombre').lean();
  return new Map(docs.map((d) => [String(d._id), d.nombre]));
}

function etiquetaMes(clave) {
  const [y, m] = clave.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]} ${y}`;
}

async function etiquetar(c, claves, M) {
  switch (c.agrupar_por) {
    case 'agencia': {
      const mapa = await nombresPorId(Agencia, claves, M);
      return (k) => mapa.get(String(k)) || 'Agencia sin nombre';
    }
    case 'producto': {
      const mapa = await nombresPorId(Producto, claves, M);
      return (k) => mapa.get(String(k)) || 'Producto sin nombre';
    }
    case 'tipo_producto': return (k) => ETIQUETAS_TIPO[k] || 'Sin tipo';
    case 'estado': return (k) => ETIQUETAS_ESTADO[c.fuente][k] || k;
    case 'metodo_pago': return (k) => ETIQUETAS_METODO[k] || k;
    case 'mes': return (k) => (k ? etiquetaMes(k) : 'Sin fecha');
    default: return (k) => k;
  }
}

// ─────────────────────────────────────────────
// Descripción de la consulta
// ─────────────────────────────────────────────

function describirFiltros(c, nombres) {
  const partes = [];
  const { estado, tipo_producto: tipo, metodo_pago: metodo } = c.filtros;
  if (estado.length) partes.push(`con estado ${estado.map((e) => ETIQUETAS_ESTADO[c.fuente][e].toLowerCase()).join(' o ')}`);
  if (tipo.length) partes.push(`de tipo ${tipo.map((t) => ETIQUETAS_TIPO[t].toLowerCase()).join(' o ')}`);
  if (nombres.agencias) partes.push(`de ${nombres.agencias.nombres.join(', ')}`);
  if (nombres.productos) partes.push(`de ${nombres.productos.nombres.join(', ')}`);
  if (metodo.length) partes.push(`pagados con ${metodo.map((mp) => ETIQUETAS_METODO[mp].toLowerCase()).join(' o ')}`);
  return partes.length ? ` ${partes.join(', ')}` : '';
}

/**
 * Descripción legible de la consulta, para el resumen y para darle contexto a
 * la IA al redactar. Ej.: "facturación de reservas de tipo hotel por agencia,
 * en lo que va del mes".
 */
function describirConsulta(c, nombres = {}, now = new Date()) {
  const fuente = FUENTES[c.fuente].etiqueta;
  const filtros = describirFiltros(c, nombres);
  const periodo = describirPeriodoConsulta(c.periodo, c.fecha, now);
  const porViaje = c.fecha === 'viaje' ? ' (por fecha de viaje)' : '';
  if (c.modo === 'listado') return `listado de ${fuente}${filtros}${porViaje} ${periodo}`.trim();
  const metrica = METRICAS[c.metrica].etiqueta.toLowerCase();
  const agrupacion = c.agrupar_por !== 'ninguno' ? ` por ${AGRUPACIONES[c.agrupar_por].etiqueta.toLowerCase()}` : '';
  return `${metrica} de ${fuente}${filtros}${agrupacion}${porViaje} ${periodo}`.trim();
}

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ─────────────────────────────────────────────
// Resolución por modo
// ─────────────────────────────────────────────

/** Resumen sin agrupar: un solo valor (tarjeta), con comparación opcional. */
async function resolverTotal(c, M, nombres, now) {
  const rango = rangoPeriodo(c.periodo, c.fecha, now);
  const [actual] = await agruparValores(c, M, rango, nombres, { conLimite: false });
  const valor = actual?.valor ?? (c.metrica === 'tasa_conversion' ? null : 0);
  const tipo = METRICAS[c.metrica].tipo;
  const descripcion = describirConsulta(c, nombres, now);

  const stat = { value: formatearValor(valor, tipo), label: capitalizar(descripcion) };
  let summary = `${capitalizar(descripcion)}: ${formatearValor(valor, tipo)}.`;
  let comparacion = null;

  if (c.comparar) {
    const anterior = rangoAnterior(c.periodo, c.fecha, now);
    const [prev] = await agruparValores(c, M, anterior, nombres, { conLimite: false });
    const valorPrev = prev?.valor ?? (c.metrica === 'tasa_conversion' ? null : 0);
    const variacion = valorPrev ? redondear(((valor - valorPrev) / valorPrev) * 100, 1) : null;
    const rangoTxt = describirRango(anterior, c.fecha === 'viaje');
    stat.sub = `Período anterior (${rangoTxt}): ${formatearValor(valorPrev, tipo)} · ${formatearVariacion(variacion)}`;
    stat.variacion = variacion;
    summary += ` En el período anterior (${rangoTxt}) fue ${formatearValor(valorPrev, tipo)} (${formatearVariacion(variacion)}).`;
    comparacion = { anterior: valorPrev, variacion, rango: rangoTxt };
  }

  return {
    visualization: 'stat',
    stat,
    data: [{ valor, ...(comparacion && { anterior: comparacion.anterior, variacion: comparacion.variacion }) }],
    columns: [],
    columnLabels: {},
    columnTypes: {},
    summary,
    descripcion,
  };
}

/** Evolución mensual: una fila por mes, incluidos los meses sin datos. */
async function resolverSerie(c, M, nombres, now) {
  const rango = rangoPeriodo(c.periodo, c.fecha, now);
  const valores = await agruparValores(c, M, rango, nombres, { conLimite: false });
  const porMes = new Map(valores.filter((v) => v.clave).map((v) => [v.clave, v.valor]));

  // Meses del rango, si está acotado y no es demasiado largo; si no, los que
  // tienen datos (los últimos 24).
  let claves = [...porMes.keys()].sort();
  if (rango.desde) {
    const fin = rango.hasta || now;
    const tz = c.fecha === 'viaje' ? 0 : OFFSET_AR_MS;
    const ini = new Date(rango.desde.getTime() - tz);
    const ult = new Date(fin.getTime() - tz - 1);
    const total = (ult.getUTCFullYear() - ini.getUTCFullYear()) * 12 + ult.getUTCMonth() - ini.getUTCMonth() + 1;
    if (total <= MAX_MESES_SERIE) {
      claves = Array.from({ length: total }, (_, i) => {
        const d = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + i, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      });
    }
  }
  claves = claves.slice(-MAX_MESES_SERIE);

  const vacio = c.metrica === 'tasa_conversion' ? null : 0;
  const data = claves.map((k) => ({ mes: etiquetaMes(k), valor: porMes.has(k) ? porMes.get(k) : vacio }));
  const tipo = METRICAS[c.metrica].tipo;
  const descripcion = describirConsulta(c, nombres, now);
  const conDatos = data.filter((d) => d.valor);
  const mejor = conDatos.reduce((a, b) => (b.valor > a.valor ? b : a), conDatos[0]);

  return {
    visualization: 'serie',
    data,
    columns: ['mes', 'valor'],
    columnLabels: { mes: 'Mes', valor: METRICAS[c.metrica].etiqueta },
    columnTypes: { mes: 'texto', valor: tipo },
    summary: conDatos.length
      ? `Evolución de ${descripcion}. El mejor mes fue ${mejor.mes} con ${formatearValor(mejor.valor, tipo)}.`
      : `No hay datos para ${descripcion}.`,
    descripcion,
  };
}

/** Resumen agrupado (tabla), con comparación opcional. */
async function resolverAgrupado(c, M, nombres, now) {
  const rango = rangoPeriodo(c.periodo, c.fecha, now);
  const valores = await agruparValores(c, M, rango, nombres, { conLimite: true });
  const etiqueta = await etiquetar(c, valores.map((v) => v.clave), M);
  const tipo = METRICAS[c.metrica].tipo;
  const descripcion = describirConsulta(c, nombres, now);
  const colGrupo = c.agrupar_por;

  let data = valores.map((v) => ({ [colGrupo]: etiqueta(v.clave), valor: v.valor }));
  const columns = [colGrupo, 'valor'];
  const columnLabels = { [colGrupo]: AGRUPACIONES[colGrupo].etiqueta, valor: METRICAS[c.metrica].etiqueta };
  const columnTypes = { [colGrupo]: 'texto', valor: tipo };
  let extra = '';

  if (c.comparar) {
    const anterior = rangoAnterior(c.periodo, c.fecha, now);
    const previos = await agruparValores(c, M, anterior, nombres, { conLimite: false });
    const mapa = new Map(previos.map((p) => [String(p.clave), p.valor]));
    data = valores.map((v) => {
      const prev = mapa.get(String(v.clave)) ?? (c.metrica === 'tasa_conversion' ? null : 0);
      return {
        [colGrupo]: etiqueta(v.clave),
        valor: v.valor,
        anterior: prev,
        variacion: prev ? redondear(((v.valor - prev) / prev) * 100, 1) : null,
      };
    });
    columns.push('anterior', 'variacion');
    Object.assign(columnLabels, { valor: 'Actual', anterior: 'Período anterior', variacion: 'Variación' });
    Object.assign(columnTypes, { anterior: tipo, variacion: 'variacion' });
    extra = ` Se compara con el período ${describirRango(anterior, c.fecha === 'viaje')}.`;
  }

  const primero = data[0];
  const summary = data.length === 0
    ? `No hay datos para ${descripcion}.`
    : `${capitalizar(descripcion)}. ${c.orden === 'asc' ? 'El valor más bajo es de' : 'Encabeza'} ${primero[colGrupo]} con ${formatearValor(primero.valor, tipo)}.${extra}`;

  return { visualization: 'table', data, columns, columnLabels, columnTypes, summary, descripcion };
}

/** Listado de registros sueltos (reservas, cotizaciones o pagos). */
async function resolverListado(c, M, nombres, now) {
  const rango = rangoPeriodo(c.periodo, c.fecha, now);
  const { Model, etapas } = etapasBase(c, M, rango, nombres);
  const calendario = c.fecha === 'viaje';

  let campoOrden;
  if (c.fuente === 'pagos') campoOrden = 'pago.created_at';
  else if (calendario) campoOrden = c.fuente === 'reservas' ? 'cot.fecha_inicio' : 'fecha_inicio';
  else campoOrden = 'created_at';
  // Los viajes, del más próximo al más lejano; lo demás, lo más reciente primero
  const direccion = calendario ? 1 : -1;

  const [resultado] = await agregar(Model, [
    ...etapas,
    { $sort: { [campoOrden]: direccion } },
    { $facet: { total: [{ $count: 'n' }], filas: [{ $limit: c.limite }] } },
  ]);
  const total = resultado?.total[0]?.n ?? 0;
  const filas = resultado?.filas ?? [];

  const agencias = await nombresPorId(Agencia, filas.map((f) => f.agencia_id), M);
  const agencia = (f) => agencias.get(String(f.agencia_id)) || 'Agencia sin nombre';

  let data;
  let columns;
  let columnLabels;
  let columnTypes;

  if (c.fuente === 'pagos') {
    data = filas.map((f) => ({
      fecha: formatearFecha(f.pago.created_at, false),
      agencia: agencia(f),
      metodo: ETIQUETAS_METODO[f.pago.metodo] || f.pago.metodo,
      monto: aNumero(f.pago.monto),
      estado: ETIQUETAS_ESTADO.pagos[f.estado_pago],
    }));
    columns = ['fecha', 'agencia', 'metodo', 'monto', 'estado'];
    columnLabels = { fecha: 'Informado', agencia: 'Agencia', metodo: 'Método', monto: 'Monto', estado: 'Estado' };
    columnTypes = { fecha: 'texto', agencia: 'texto', metodo: 'texto', monto: 'moneda', estado: 'texto' };
  } else {
    const doc = (f) => (c.fuente === 'reservas' ? f.cot : f);
    data = filas.map((f) => ({
      fecha: calendario ? formatearFecha(doc(f).fecha_inicio, true) : formatearFecha(f.created_at, false),
      agencia: agencia(f),
      producto: f.prod?.nombre || 'Producto sin nombre',
      pasajeros: doc(f).pasajeros ?? '-',
      estado: ETIQUETAS_ESTADO[c.fuente][f.estado] || f.estado,
      monto: aNumero(doc(f).precio_total),
    }));
    columns = ['fecha', 'agencia', 'producto', 'pasajeros', 'estado', 'monto'];
    columnLabels = {
      fecha: calendario ? 'Viaje' : 'Fecha', agencia: 'Agencia', producto: 'Producto',
      pasajeros: 'Pax', estado: 'Estado', monto: 'Monto',
    };
    columnTypes = {
      fecha: 'texto', agencia: 'texto', producto: 'texto', pasajeros: 'numero', estado: 'texto', monto: 'moneda',
    };
  }

  const descripcion = describirConsulta(c, nombres, now);
  const detalle = `${describirFiltros(c, nombres)}${calendario ? ' con viaje' : ''} ${describirPeriodoConsulta(c.periodo, c.fecha, now)}`;
  const sujeto = total === 1 ? SINGULAR[c.fuente] : FUENTES[c.fuente].etiqueta;
  let summary = total === 0
    ? `No hay ${FUENTES[c.fuente].etiqueta}${detalle}.`
    : `Hay ${total} ${sujeto}${detalle}.`;
  if (total > data.length) summary += ` Se muestran ${data.length}.`;

  return { visualization: 'table', data, columns, columnLabels, columnTypes, summary, descripcion, total };
}

// ── Agencias y productos ──

/** IDs de agencias o productos con reservas no canceladas en el rango. */
async function idsConReservas(M, rango, campo) {
  const match = { mayorista_id: M, estado: { $ne: 'cancelada' } };
  if (filtroRango(rango)) match.created_at = filtroRango(rango);
  const etapas = campo === 'agencia'
    ? [{ $match: match }, { $group: { _id: '$agencia_id' } }]
    : [
      { $match: match },
      { $lookup: { from: cotizacionCollection(), localField: 'cotizacion_id', foreignField: '_id', as: 'cot' } },
      { $unwind: '$cot' },
      { $match: { 'cot.mayorista_id': M } },
      { $group: { _id: '$cot.producto_id' } },
    ];
  const filas = await agregar(Reserva, etapas);
  return new Set(filas.map((f) => String(f._id)));
}

async function resolverAgencias(c, M, now) {
  const activas = await Agencia.find({ mayorista_id: M, activo: true }).select('nombre').lean();
  const descripcion = describirConsulta(c, {}, now);

  if (c.metrica === 'cantidad') {
    const valor = activas.length;
    return {
      visualization: 'stat',
      stat: { value: String(valor), label: 'Agencias activas' },
      data: [{ valor }], columns: [], columnLabels: {}, columnTypes: {},
      summary: `Tenés ${valor} ${valor === 1 ? 'agencia activa' : 'agencias activas'}.`,
      descripcion: 'cantidad de agencias activas',
    };
  }

  if (c.metrica === 'sin_reservas') {
    const rango = rangoPeriodo(c.periodo, c.fecha, now);
    const conReservas = await idsConReservas(M, rango, 'agencia');
    const sin = activas.filter((a) => !conReservas.has(String(a._id)));
    const periodo = describirPeriodoConsulta(c.periodo, c.fecha, now);
    return {
      visualization: 'list',
      data: sin.slice(0, c.limite).map((a) => ({ agencia: a.nombre || 'Sin nombre' })),
      columns: ['agencia'], columnLabels: { agencia: 'Agencia' }, columnTypes: { agencia: 'texto' },
      summary: `${sin.length} de ${activas.length} agencias activas no tuvieron reservas ${periodo}.`
        + (sin.length > c.limite ? ` Se muestran ${c.limite}.` : ''),
      descripcion,
    };
  }

  // dias_sin_reservar
  const ultimas = await agregar(Reserva, [
    { $match: { mayorista_id: M, estado: { $ne: 'cancelada' } } },
    { $group: { _id: '$agencia_id', ultima: { $max: '$created_at' } } },
  ]);
  const porAgencia = new Map(ultimas.map((u) => [String(u._id), u.ultima]));
  const filas = activas.map((a) => {
    const ultima = porAgencia.get(String(a._id));
    return {
      agencia: a.nombre || 'Sin nombre',
      dias: ultima ? Math.floor((now - new Date(ultima)) / DIA_MS) : null,
      ultima: ultima ? formatearFecha(ultima, false) : 'Nunca reservó',
    };
  });
  // Las que nunca reservaron primero; después, las de más días
  filas.sort((a, b) => (c.orden === 'asc'
    ? (a.dias ?? Infinity) - (b.dias ?? Infinity)
    : (b.dias ?? Infinity) - (a.dias ?? Infinity)));
  const data = filas.slice(0, c.limite).map((f) => ({ ...f, dias: f.dias ?? '-' }));
  const primera = data[0];

  return {
    visualization: 'table',
    data,
    columns: ['agencia', 'dias', 'ultima'],
    columnLabels: { agencia: 'Agencia', dias: 'Días sin reservar', ultima: 'Última reserva' },
    columnTypes: { agencia: 'texto', dias: 'numero', ultima: 'texto' },
    summary: primera
      ? `Agencias activas según los días desde su última reserva. ${primera.dias === '-'
        ? `${primera.agencia} todavía no reservó nunca.`
        : `${primera.agencia} lleva ${primera.dias} días sin reservar.`}`
      : 'No tenés agencias activas.',
    descripcion: 'días sin reservar de las agencias activas',
  };
}

async function resolverProductos(c, M, now) {
  // Activos y con disponibilidad vigente: un producto vencido ya no se vende,
  // así que no tiene sentido contarlo ni señalarlo como "sin reservas".
  const match = { mayorista_id: M, activo: true, disponibilidad_hasta: { $gte: new Date(hoyDateString(now)) } };
  if (c.filtros.tipo_producto.length) match.tipo = { $in: c.filtros.tipo_producto };
  const descripcion = describirConsulta(c, {}, now);

  if (c.metrica === 'cantidad') {
    if (c.agrupar_por === 'tipo_producto') {
      const filas = await agregar(Producto, [
        { $match: match },
        { $group: { _id: '$tipo', valor: { $sum: 1 } } },
        { $sort: { valor: -1 } },
      ]);
      const data = filas.map((f) => ({ tipo_producto: ETIQUETAS_TIPO[f._id] || 'Sin tipo', valor: f.valor }));
      return {
        visualization: 'table', data,
        columns: ['tipo_producto', 'valor'],
        columnLabels: { tipo_producto: 'Tipo de producto', valor: 'Productos activos' },
        columnTypes: { tipo_producto: 'texto', valor: 'numero' },
        summary: data.length
          ? `Productos activos por tipo: ${data.map((d) => `${d.valor} de ${d.tipo_producto.toLowerCase()}`).join(', ')}.`
          : 'No tenés productos activos.',
        descripcion,
      };
    }
    const valor = await Producto.countDocuments(match);
    return {
      visualization: 'stat',
      stat: { value: String(valor), label: 'Productos activos' },
      data: [{ valor }], columns: [], columnLabels: {}, columnTypes: {},
      summary: `Tenés ${valor} ${valor === 1 ? 'producto activo' : 'productos activos'}${describirFiltros(c, {})}.`,
      descripcion,
    };
  }

  // sin_reservas
  const activos = await Producto.find(match).select('nombre tipo').lean();
  const rango = rangoPeriodo(c.periodo, c.fecha, now);
  const conReservas = await idsConReservas(M, rango, 'producto');
  const sin = activos.filter((p) => !conReservas.has(String(p._id)));
  const periodo = describirPeriodoConsulta(c.periodo, c.fecha, now);
  return {
    visualization: 'table',
    data: sin.slice(0, c.limite).map((p) => ({ producto: p.nombre || 'Sin nombre', tipo: ETIQUETAS_TIPO[p.tipo] || '-' })),
    columns: ['producto', 'tipo'],
    columnLabels: { producto: 'Producto', tipo: 'Tipo' },
    columnTypes: { producto: 'texto', tipo: 'texto' },
    summary: `${sin.length} de ${activos.length} productos activos no tuvieron reservas ${periodo}.`
      + (sin.length > c.limite ? ` Se muestran ${c.limite}.` : ''),
    descripcion,
  };
}

// ─────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────

/**
 * Ejecuta una consulta validada.
 *
 * @param {object} consulta   Resultado de validarConsulta()
 * @param {string} mayoristaIdStr  req.mayorista_id (del middleware, nunca del cliente)
 * @returns {Promise<object>} { visualization, data, columns, columnLabels, columnTypes,
 *                              stat?, summary, descripcion } o { aviso }
 */
async function ejecutarConsulta(consulta, mayoristaIdStr, now = new Date()) {
  const M = new mongoose.Types.ObjectId(mayoristaIdStr);
  const c = consulta;

  if (c.fuente === 'agencias') return resolverAgencias(c, M, now);
  if (c.fuente === 'productos') return resolverProductos(c, M, now);

  const nombres = await resolverFiltrosNombre(c.filtros, M);
  if (nombres.aviso) return { aviso: nombres.aviso };

  let resultado;
  if (c.modo === 'listado') resultado = await resolverListado(c, M, nombres, now);
  else if (c.agrupar_por === 'ninguno') resultado = await resolverTotal(c, M, nombres, now);
  else if (c.agrupar_por === 'mes') resultado = await resolverSerie(c, M, nombres, now);
  else resultado = await resolverAgrupado(c, M, nombres, now);

  // Nombres por los que se filtró: la capa de IA los reemplaza por códigos
  // antes de enviar el resultado a redactar.
  resultado.entidades = {
    agencias: nombres.agencias?.nombres || [],
    productos: nombres.productos?.nombres || [],
  };
  return resultado;
}

module.exports = {
  ejecutarConsulta,
  describirConsulta,
  // Exportados para verificación
  rangoPeriodo,
  rangoAnterior,
  describirPeriodoConsulta,
  etapasReservas,
  etapasCotizaciones,
  etapasPagos,
  escaparRegex,
};
