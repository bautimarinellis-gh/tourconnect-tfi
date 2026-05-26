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

// ─────────────────────────────────────────────
// Helpers de rango de fechas
// ─────────────────────────────────────────────

function getFechaDesde(time_range) {
  const now = new Date();
  switch (time_range) {
    case 'today': {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return d;
    }
    case 'last_7_days': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d;
    }
    case 'current_month':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case 'last_90_days': {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return d;
    }
    case 'last_6_months': {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    case 'current_year':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case 'last_30_days':
    default: {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    }
  }
}

function timeRangeLabel(time_range) {
  const labels = {
    today: 'hoy',
    last_7_days: 'los últimos 7 días',
    current_month: 'el mes actual',
    last_30_days: 'los últimos 30 días',
    last_90_days: 'los últimos 90 días',
    last_6_months: 'los últimos 6 meses',
    current_year: 'el año actual',
  };
  return labels[time_range] || 'los últimos 30 días';
}

function formatMonto(val) {
  if (!val) return 0;
  const n = typeof val.toString === 'function' ? parseFloat(val.toString()) : Number(val);
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
  const { limit = 5, time_range = 'last_30_days', orderBy = 'reservas' } = params;
  const fechaDesde = getFechaDesde(time_range);
  const sortField = orderBy === 'facturacion' ? 'monto_total' : 'cantidad_reservas';

  const pipeline = [
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: { $gte: fechaDesde },
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
    summary: `Top ${data.length} agencias en ${timeRangeLabel(time_range)}. `
      + `${totalReservas} reservas, $${totalFacturado.toLocaleString('es-AR')} facturados.`,
    columns: ['agencia', 'reservas', 'facturacion'],
    columnLabels: { agencia: 'Agencia', reservas: 'Reservas', facturacion: 'Facturación ($)' },
  };
}

/**
 * cotizaciones_pendientes
 * Lista de cotizaciones en estado "pendiente" del mayorista.
 */
async function handleCotizacionesPendientes(params, mayoristaId) {
  const { limit = 10, time_range = 'last_30_days' } = params;
  const fechaDesde = getFechaDesde(time_range);

  const cotizaciones = await Cotizacion.find({
    mayorista_id: mayoristaId,
    estado: 'pendiente',
    created_at: { $gte: fechaDesde },
  })
    .sort({ created_at: -1 })
    .limit(Math.min(limit, 50))
    .populate('agencia_id', 'nombre')
    .populate('producto_id', 'nombre')
    .lean();

  const data = cotizaciones.map((c) => ({
    agencia: c.agencia_id?.nombre || 'Agencia desconocida',
    producto: c.producto_id?.nombre || 'Producto desconocido',
    pasajeros: c.pasajeros,
    monto: formatMonto(c.precio_total),
    fecha: c.created_at ? new Date(c.created_at).toLocaleDateString('es-AR') : '-',
  }));

  return {
    data,
    summary: `${data.length} cotizaciones pendientes en ${timeRangeLabel(time_range)}.`,
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
  const fechaCorte = new Date();
  fechaCorte.setDate(fechaCorte.getDate() - dias_inactivos);

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
  const { time_range = 'last_30_days' } = params;
  const fechaDesde = getFechaDesde(time_range);

  const resultado = await Reserva.aggregate([
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $in: ['pago_informado', 'pagada', 'cerrada'] },
        created_at: { $gte: fechaDesde },
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
    summary: `$${totalIngresos.toLocaleString('es-AR')} en ingresos durante ${timeRangeLabel(time_range)} (${totalReservas} reservas confirmadas).`,
    stat: {
      value: `$${totalIngresos.toLocaleString('es-AR')}`,
      label: `Ingresos en ${timeRangeLabel(time_range)}`,
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
  const { time_range = 'last_30_days' } = params;
  const fechaDesde = getFechaDesde(time_range);

  const estadoLabels = {
    pendiente_pago: 'Pendiente de pago',
    pago_informado: 'Pago informado',
    pagada: 'Pagada',
    cerrada: 'Cerrada',
    cancelada: 'Cancelada',
  };

  const resultado = await Reserva.aggregate([
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    { $match: { created_at: { $gte: fechaDesde } } },
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
    summary: `${total} reservas en total en ${timeRangeLabel(time_range)}, distribuidas en ${data.length} estados.`,
    columns: ['estado', 'cantidad'],
    columnLabels: { estado: 'Estado', cantidad: 'Cantidad' },
  };
}

/**
 * producto_top
 * Top N productos más reservados en el período.
 */
async function handleProductoTop(params, mayoristaId) {
  const { limit = 5, time_range = 'last_30_days' } = params;
  const fechaDesde = getFechaDesde(time_range);

  const pipeline = [
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: { $gte: fechaDesde },
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
    summary: `Top ${data.length} productos por reservas en ${timeRangeLabel(time_range)}.`,
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

module.exports = { execute, intentHandlers };
