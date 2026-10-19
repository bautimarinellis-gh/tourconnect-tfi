/**
 * Query Executor — Handlers de MongoDB para cada intent del Asistente.
 *
 * SEGURIDAD MULTI-TENANT:
 *  - El mayorista_id SIEMPRE es inyectado desde el middleware JWT.
 *  - NUNCA proviene del body del request.
 *  - Todo pipeline EMPIEZA con el filtro de mayorista_id.
 */

const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Agencia = require('../models/Agencia');
const {
  lookupCotizacionStages,
  productoCollection,
  agenciaCollection,
} = require('./reporteHelpers');
const { MESES, hoyAR, inicioDiaAR } = require('./fechasAR');

// ─────────────────────────────────────────────
// Helpers de rango de fechas
// ─────────────────────────────────────────────

/** Valores de `time_range` que entiende getDateRange (el default es last_30_days). */
const PERIODOS_VALIDOS = [
  'today', 'yesterday', 'last_n_days', 'last_30_days', 'last_week', 'current_month',
  'last_month', 'last_n_months', 'current_quarter', 'last_quarter', 'current_year',
  'last_year', 'specific_month', 'all_time',
];

/**
 * Rango de fechas del período pedido, en hora argentina.
 *
 * Devuelve { fechaDesde, fechaHasta } con fechaHasta EXCLUSIVO. Los períodos
 * que ya terminaron ("ayer", "el mes pasado", "diciembre 2025") son cerrados;
 * los que siguen en curso ("hoy", "este mes", "últimos 30 días") tienen
 * fechaHasta null, es decir, hasta ahora.
 */
function getDateRange(params, now = new Date()) {
  const { time_range, days, months, month, year } = params;
  const { y, m, d, dow } = hoyAR(now);
  const abierto = (fechaDesde) => ({ fechaDesde, fechaHasta: null });
  const cerrado = (fechaDesde, fechaHasta) => ({ fechaDesde, fechaHasta });

  switch (time_range) {
    case 'today':
      return abierto(inicioDiaAR(y, m, d));
    case 'yesterday':
      return cerrado(inicioDiaAR(y, m, d - 1), inicioDiaAR(y, m, d));
    case 'last_n_days':
      // Los últimos N días incluyen hoy: hoy y los N-1 anteriores.
      return abierto(inicioDiaAR(y, m, d - (days - 1)));
    case 'last_week': {
      // Semana calendario anterior, de lunes a domingo.
      const lunes = d - ((dow + 6) % 7);
      return cerrado(inicioDiaAR(y, m, lunes - 7), inicioDiaAR(y, m, lunes));
    }
    case 'current_month':
      return abierto(inicioDiaAR(y, m, 1));
    case 'last_month':
      return cerrado(inicioDiaAR(y, m - 1, 1), inicioDiaAR(y, m, 1));
    case 'last_n_months':
      return abierto(inicioDiaAR(y, m - months, d + 1));
    case 'current_quarter':
      return abierto(inicioDiaAR(y, m - (m % 3), 1));
    case 'last_quarter': {
      const inicioTrimestre = m - (m % 3);
      return cerrado(inicioDiaAR(y, inicioTrimestre - 3, 1), inicioDiaAR(y, inicioTrimestre, 1));
    }
    case 'current_year':
      return abierto(inicioDiaAR(y, 0, 1));
    case 'last_year':
      return cerrado(inicioDiaAR(y - 1, 0, 1), inicioDiaAR(y, 0, 1));
    case 'specific_month':
      return cerrado(inicioDiaAR(year, month - 1, 1), inicioDiaAR(year, month, 1));
    case 'all_time':
      return abierto(new Date(0));
    default: // last_30_days
      return abierto(inicioDiaAR(y, m, d - 29));
  }
}

/** Filtro de MongoDB para un campo fecha según el período. */
function filtroFecha(params) {
  const { fechaDesde, fechaHasta } = getDateRange(params);
  return fechaHasta ? { $gte: fechaDesde, $lt: fechaHasta } : { $gte: fechaDesde };
}

/**
 * Frase que describe el período, lista para ir después del sujeto:
 * "Ingresos hoy", "Top 5 agencias en agosto 2026", "12 reservas la semana pasada".
 */
function describirPeriodo(params, now = new Date()) {
  const { time_range, days, months, month, year } = params;
  const { y, m } = hoyAR(now);

  switch (time_range) {
    case 'today':           return 'hoy';
    case 'yesterday':       return 'ayer';
    case 'last_n_days':     return days === 1 ? 'hoy' : `en los últimos ${days} días`;
    case 'last_week':       return 'la semana pasada';
    case 'current_month':   return 'en lo que va del mes';
    case 'last_month': {
      const mesPasado = new Date(Date.UTC(y, m - 1, 1));
      return `en ${MESES[mesPasado.getUTCMonth()]} ${mesPasado.getUTCFullYear()}`;
    }
    case 'last_n_months':   return months === 1 ? 'en el último mes' : `en los últimos ${months} meses`;
    case 'current_quarter': return 'en lo que va del trimestre';
    case 'last_quarter':    return 'el trimestre pasado';
    case 'current_year':    return `en lo que va de ${y}`;
    case 'last_year':       return `en ${y - 1}`;
    case 'specific_month':  return `en ${MESES[month - 1]} ${year}`;
    case 'all_time':        return 'en todo el historial';
    default:                return 'en los últimos 30 días';
  }
}

function formatMonto(val) {
  if (!val) return 0;
  const n = val instanceof mongoose.Types.Decimal128
    ? parseFloat(val.toString())
    : Number(val);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────
// Handlers por intent
// ─────────────────────────────────────────────

/**
 * top_agencias
 * Retorna las N agencias con más reservas o mayor facturación.
 */
async function handleTopAgencias(params, mayoristaId) {
  const { limit = 5, orderBy = 'reservas' } = params;
  const dateFilter = filtroFecha(params);
  const sortField = orderBy === 'facturacion' ? 'monto_total' : 'cantidad_reservas';

  const pipeline = [
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: dateFilter,
      },
    },
    {
      $group: {
        _id: '$cot.agencia_id',
        cantidad_reservas: { $sum: 1 },
        monto_total: { $sum: '$cot.precio_total' },
      },
    },
    { $sort: { [sortField]: -1 } },
    { $limit: Math.min(limit, 20) },
    {
      $lookup: {
        from: agenciaCollection(),
        localField: '_id',
        foreignField: '_id',
        as: 'agencia_info',
      },
    },
    { $unwind: { path: '$agencia_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        agencia: { $ifNull: ['$agencia_info.nombre', 'Agencia sin nombre'] },
        reservas: '$cantidad_reservas',
        facturacion: '$monto_total',
      },
    },
  ];

  const resultados = await Reserva.aggregate(pipeline);

  const data = resultados.map((r) => ({
    agencia: r.agencia,
    reservas: r.reservas,
    facturacion: formatMonto(r.facturacion),
  }));

  const totalReservas = data.reduce((s, r) => s + r.reservas, 0);
  const totalFacturado = data.reduce((s, r) => s + r.facturacion, 0);

  return {
    data,
    summary: `Top ${data.length} agencias ${describirPeriodo(params)}: `
      + `${totalReservas} reservas, $${totalFacturado.toLocaleString('en-US')} facturados.`,
    columns: ['agencia', 'reservas', 'facturacion'],
    columnLabels: { agencia: 'Agencia', reservas: 'Reservas', facturacion: 'Facturación ($)' },
  };
}

/**
 * cotizaciones_pendientes
 * Lista de cotizaciones en estado "pendiente" del mayorista.
 */
async function handleCotizacionesPendientes(params, mayoristaId) {
  const { limit = 10 } = params;

  // $facet cuenta el total antes del $limit: el resumen tiene que decir
  // cuántas pendientes hay, no cuántas filas se muestran.
  const [resultado] = await Cotizacion.aggregate([
    {
      $match: {
        mayorista_id: mayoristaId,
        estado: 'pendiente',
        created_at: filtroFecha(params),
      },
    },
    {
      $facet: {
        total: [{ $count: 'n' }],
        filas: [
          { $sort: { created_at: -1 } },
          { $limit: Math.min(limit, 20) },
          {
            $lookup: {
              from: agenciaCollection(),
              localField: 'agencia_id',
              foreignField: '_id',
              as: 'agencia_info',
            },
          },
          { $unwind: { path: '$agencia_info', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: productoCollection(),
              localField: 'producto_id',
              foreignField: '_id',
              as: 'producto_info',
            },
          },
          { $unwind: { path: '$producto_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              agencia: { $ifNull: ['$agencia_info.nombre', 'Agencia desconocida'] },
              producto: { $ifNull: ['$producto_info.nombre', 'Producto desconocido'] },
              pasajeros: 1,
              monto: '$precio_total',
              fecha: '$created_at',
            },
          },
        ],
      },
    },
  ]);

  const total = resultado?.total[0]?.n ?? 0;
  const rows = resultado?.filas ?? [];

  const data = rows.map((c) => ({
    agencia: c.agencia,
    producto: c.producto,
    pasajeros: c.pasajeros,
    monto: formatMonto(c.monto),
    fecha: c.fecha
      ? new Date(c.fecha).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
      : '-',
  }));

  const periodo = params.time_range === 'all_time' ? '' : ` ${describirPeriodo(params)}`;
  let summary = total === 1
    ? `Tenés 1 cotización pendiente${periodo}.`
    : `Tenés ${total} cotizaciones pendientes${periodo}.`;
  if (total > data.length) {
    summary += ` Se muestran las ${data.length} más recientes.`;
  }

  return {
    data,
    summary,
    columns: ['agencia', 'producto', 'pasajeros', 'monto', 'fecha'],
    columnLabels: {
      agencia: 'Agencia', producto: 'Producto',
      pasajeros: 'Pasajeros', monto: 'Monto ($)', fecha: 'Fecha',
    },
  };
}

/**
 * agencias_inactivas
 * Agencias que no generaron reservas en los últimos N días.
 */
async function handleAgenciasInactivas(params, mayoristaId) {
  const { dias_inactivos = 30 } = params;
  const { fechaDesde: fechaCorte } = getDateRange({ time_range: 'last_n_days', days: dias_inactivos });

  // Agencias activas del mayorista
  const todasAgencias = await Agencia.find({ mayorista_id: mayoristaId, activo: true })
    .select('nombre')
    .lean();

  if (todasAgencias.length === 0) {
    return {
      data: [],
      summary: 'No tenés agencias activas registradas.',
    };
  }

  // IDs de agencias que SÍ tuvieron reservas en el período
  const reservasRecientes = await Reserva.aggregate([
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: { $gte: fechaCorte },
      },
    },
    { $group: { _id: '$cot.agencia_id' } },
  ]);

  const agenciasActivasIds = new Set(reservasRecientes.map((r) => r._id.toString()));

  const inactivas = todasAgencias
    .filter((a) => !agenciasActivasIds.has(a._id.toString()))
    .map((a) => ({ agencia: a.nombre || 'Sin nombre' }));

  return {
    data: inactivas,
    summary: `${inactivas.length} de ${todasAgencias.length} agencias sin reservas en los últimos ${dias_inactivos} días.`,
    columns: ['agencia'],
    columnLabels: { agencia: 'Agencia inactiva' },
  };
}

/**
 * ingresos_periodo
 * Total de ingresos (reservas no canceladas) en el período.
 */
async function handleIngresosPeriodo(params, mayoristaId) {
  const dateFilter = filtroFecha(params);

  const resultado = await Reserva.aggregate([
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $in: ['pago_informado', 'pagada', 'cerrada'] },
        created_at: dateFilter,
      },
    },
    {
      $group: {
        _id: null,
        total_ingresos: { $sum: '$cot.precio_total' },
        total_reservas: { $sum: 1 },
      },
    },
  ]);

  const totalIngresos = resultado[0]?.total_ingresos ? formatMonto(resultado[0].total_ingresos) : 0;
  const totalReservas = resultado[0]?.total_reservas || 0;

  return {
    data: [{ label: 'Total ingresos', valor: totalIngresos, reservas: totalReservas }],
    summary: `$${totalIngresos.toLocaleString('en-US')} en ingresos ${describirPeriodo(params)} (${totalReservas} reservas confirmadas).`,
    stat: {
      value: `$${totalIngresos.toLocaleString('en-US')}`,
      label: `Ingresos ${describirPeriodo(params)}`,
      sub: `${totalReservas} reservas confirmadas`,
    },
    columns: [],
    columnLabels: {},
  };
}

/**
 * reservas_por_estado
 * Resumen de reservas agrupadas por estado.
 */
async function handleReservasPorEstado(params, mayoristaId) {
  const dateFilter = filtroFecha(params);

  const estadoLabels = {
    pendiente_pago: 'Pendiente de pago',
    pago_informado: 'Pago informado',
    pagada: 'Pagada',
    cerrada: 'Cerrada',
    cancelada: 'Cancelada',
  };

  const resultado = await Reserva.aggregate([
    { $match: { created_at: dateFilter } },
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    { $group: { _id: '$estado', cantidad: { $sum: 1 } } },
    { $sort: { cantidad: -1 } },
  ]);

  const data = resultado.map((r) => ({
    estado: estadoLabels[r._id] || r._id,
    cantidad: r.cantidad,
  }));

  const total = data.reduce((s, r) => s + r.cantidad, 0);

  return {
    data,
    summary: `${total} reservas ${describirPeriodo(params)}, distribuidas en ${data.length} estados.`,
    columns: ['estado', 'cantidad'],
    columnLabels: { estado: 'Estado', cantidad: 'Cantidad' },
  };
}

/**
 * producto_top
 * Top N productos más reservados en el período.
 */
async function handleProductoTop(params, mayoristaId) {
  const { limit = 5 } = params;
  const dateFilter = filtroFecha(params);

  const pipeline = [
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: dateFilter,
      },
    },
    {
      $group: {
        _id: '$cot.producto_id',
        reservas: { $sum: 1 },
        facturacion: { $sum: '$cot.precio_total' },
      },
    },
    { $sort: { reservas: -1 } },
    { $limit: Math.min(limit, 20) },
    {
      $lookup: {
        from: productoCollection(),
        localField: '_id',
        foreignField: '_id',
        as: 'producto_info',
      },
    },
    { $unwind: { path: '$producto_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        producto: { $ifNull: ['$producto_info.nombre', 'Producto desconocido'] },
        tipo: { $ifNull: ['$producto_info.tipo', 'N/A'] },
        reservas: 1,
        facturacion: 1,
      },
    },
  ];

  const resultados = await Reserva.aggregate(pipeline);

  const data = resultados.map((r) => ({
    producto: r.producto,
    tipo: r.tipo,
    reservas: r.reservas,
    facturacion: formatMonto(r.facturacion),
  }));

  return {
    data,
    summary: `Top ${data.length} productos por reservas ${describirPeriodo(params)}.`,
    columns: ['producto', 'tipo', 'reservas', 'facturacion'],
    columnLabels: {
      producto: 'Producto', tipo: 'Tipo',
      reservas: 'Reservas', facturacion: 'Facturación ($)',
    },
  };
}

// ─────────────────────────────────────────────
// Query Executor — Punto de entrada
// ─────────────────────────────────────────────

const intentHandlers = {
  top_agencias: handleTopAgencias,
  cotizaciones_pendientes: handleCotizacionesPendientes,
  agencias_inactivas: handleAgenciasInactivas,
  ingresos_periodo: handleIngresosPeriodo,
  reservas_por_estado: handleReservasPorEstado,
  producto_top: handleProductoTop,
};

/**
 * Ejecuta un intent con los params dados.
 * El mayorista_id SIEMPRE viene del middleware, nunca del cliente.
 *
 * @param {string} intent
 * @param {object} params
 * @param {string} mayoristaIdStr - string del ObjectId del mayorista
 * @returns {Promise<object>} resultado con data, summary, visualization
 */
async function execute(intent, params, mayoristaIdStr) {
  const handler = intentHandlers[intent];

  if (!handler) {
    throw new Error(`Handler no encontrado para intent: ${intent}`);
  }

  const mayoristaId = new mongoose.Types.ObjectId(mayoristaIdStr);
  const startTime = Date.now();

  const result = await handler(params, mayoristaId);

  return {
    ...result,
    metadata: {
      time_range: params.time_range || null,
      executed_at: new Date().toISOString(),
      query_time_ms: Date.now() - startTime,
    },
  };
}

module.exports = { execute, intentHandlers, describirPeriodo, getDateRange, PERIODOS_VALIDOS };
