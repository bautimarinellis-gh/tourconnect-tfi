const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
const {
  lookupCotizacionStages,
  productoCollection,
  agenciaCollection,
} = require('../utils/reporteHelpers');
const { drawTable } = require('../utils/pdfHelpers');

const ESTADOS_INGRESO = ['pago_informado', 'pagada', 'cerrada'];

const getDefaultFechas = (desde, hasta, mesesAtras = 6, paraMesActual = false) => {
  let fechaInicio, fechaFin;

  if (desde && hasta) {
    fechaInicio = new Date(desde);
    fechaFin = new Date(hasta);
    fechaFin.setUTCHours(23, 59, 59, 999);
  } else if (paraMesActual) {
    const now = new Date();
    fechaInicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    fechaFin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  } else {
    const now = new Date();
    fechaFin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    fechaInicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (mesesAtras - 1), 1));
  }

  return { fechaInicio, fechaFin };
};

const pad2 = (value) => String(value).padStart(2, '0');

const parsePeriodoIngresos = (periodo = 'mes', valor) => {
  const now = new Date();
  const selected = periodo || 'mes';
  const defaultValor = selected === 'dia'
    ? `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`
    : selected === 'anio'
      ? `${now.getUTCFullYear()}`
      : `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  const rawValor = valor || defaultValor;

  if (selected === 'dia') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValor)) return null;
    const [year, month, day] = rawValor.split('-').map(Number);
    const fechaInicio = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    if (
      fechaInicio.getUTCFullYear() !== year ||
      fechaInicio.getUTCMonth() !== month - 1 ||
      fechaInicio.getUTCDate() !== day
    ) {
      return null;
    }
    return {
      periodo: selected,
      valor: rawValor,
      fechaInicio,
      fechaFin,
      groupId: { $hour: '$created_at' },
      labelFor: (id) => `${pad2(id)}:00`,
      fechaFor: (id) => `${rawValor}T${pad2(id)}:00:00.000Z`,
    };
  }

  if (selected === 'mes') {
    if (!/^\d{4}-\d{2}$/.test(rawValor)) return null;
    const [year, month] = rawValor.split('-').map(Number);
    const fechaInicio = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    if (fechaInicio.getUTCFullYear() !== year || fechaInicio.getUTCMonth() !== month - 1) {
      return null;
    }
    return {
      periodo: selected,
      valor: rawValor,
      fechaInicio,
      fechaFin,
      groupId: { $dayOfMonth: '$created_at' },
      labelFor: (id) => String(id),
      fechaFor: (id) => `${rawValor}-${pad2(id)}`,
    };
  }

  if (selected === 'anio') {
    if (!/^\d{4}$/.test(rawValor)) return null;
    const year = Number(rawValor);
    const fechaInicio = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const fechaFin = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    return {
      periodo: selected,
      valor: rawValor,
      fechaInicio,
      fechaFin,
      groupId: { $month: '$created_at' },
      labelFor: (id) => `${pad2(id)}/${year}`,
      fechaFor: (id) => `${year}-${pad2(id)}`,
    };
  }

  return null;
};

exports.getAdminDashboard = async (req, res, next) => {
  try {
    const [totalMayoristas, totalAgencias, totalReservas, cotizacionesPendientes, ultimosMayoristas] =
      await Promise.all([
        Mayorista.countDocuments(),
        Agencia.countDocuments({ activo: true }),
        Reserva.countDocuments({ estado: { $ne: 'cancelada' } }),
        Cotizacion.countDocuments({ estado: 'pendiente' }),
        Mayorista.find().sort({ created_at: -1 }).limit(10).populate('usuario_id', 'email').lean(),
      ]);

    const kpis = {
      mayoristas: totalMayoristas,
      agencias: totalAgencias,
      reservas: totalReservas,
      cotizacionesPendientes,
    };

    const ultimos = ultimosMayoristas.map((m) => ({
      _id: m._id,
      nombre: m.nombre,
      email_contacto: m.usuario_id?.email ?? '-',
      activo: m.activo,
    }));

    res.json({
      success: true,
      data: { kpis, ultimosMayoristas: ultimos },
    });
  } catch (err) {
    next(err);
  }
};

async function fetchIngresosData(mayoristaId, periodoConfig) {
  const resultados = await Reserva.aggregate([
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $in: ESTADOS_INGRESO },
        created_at: { $gte: periodoConfig.fechaInicio, $lte: periodoConfig.fechaFin },
      },
    },
    {
      $group: {
        _id: periodoConfig.groupId,
        ingresos: { $sum: '$cot.precio_total' },
        reservas: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const puntos = resultados.map((r) => ({
    label: periodoConfig.labelFor(r._id),
    fecha: periodoConfig.fechaFor(r._id),
    ingresos: r.ingresos ? parseFloat(r.ingresos.toString()) : 0,
    reservas: r.reservas,
  }));

  const totalIngresos = puntos.reduce((sum, item) => sum + item.ingresos, 0);

  return {
    total_ingresos: totalIngresos,
    periodo: periodoConfig.periodo,
    valor: periodoConfig.valor,
    puntos,
  };
}

exports.getIngresos = async (req, res, next) => {
  try {
    const periodoConfig = parsePeriodoIngresos(req.query.periodo, req.query.valor);

    if (!periodoConfig) {
      return res.status(400).json({
        success: false,
        message: 'Periodo o valor invalido. Use periodo=dia|mes|anio y valor=YYYY-MM-DD|YYYY-MM|YYYY.',
      });
    }

    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);
    const data = await fetchIngresosData(mayoristaId, periodoConfig);

    return res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

async function fetchProductosTopData(mayoristaId, fechaInicio, fechaFin) {
  const pipeline = [
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: { $gte: fechaInicio, $lte: fechaFin },
      },
    },
    {
      $group: {
        _id: '$cot.producto_id',
        cantidad_reservas: { $sum: 1 },
        monto_total: { $sum: '$cot.precio_total' },
      },
    },
    { $sort: { monto_total: -1 } },
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
        nombre: { $ifNull: ['$producto_info.nombre', 'Producto desconocido'] },
        tipo: { $ifNull: ['$producto_info.tipo', 'N/A'] },
        cantidad_reservas: 1,
        monto_total: 1,
      },
    },
  ];

  const resultados = await Reserva.aggregate(pipeline);

  return resultados.map((r) => ({
    nombre: r.nombre,
    tipo: r.tipo,
    cantidad_reservas: r.cantidad_reservas,
    monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
  }));
}

exports.getIngresosPorProducto = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

    const data = await fetchProductosTopData(mayoristaId, fechaInicio, fechaFin);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

async function fetchRankingAgenciasData(mayoristaId, fechaInicio, fechaFin, itemsLimit = 10) {
  const pipeline = [
    ...lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId }),
    {
      $match: {
        estado: { $ne: 'cancelada' },
        created_at: { $gte: fechaInicio, $lte: fechaFin },
      },
    },
    {
      $group: {
        _id: { agencia_id: '$cot.agencia_id', producto_id: '$cot.producto_id' },
        cantidad: { $sum: 1 },
        monto: { $sum: '$cot.precio_total' },
      },
    },
    { $sort: { cantidad: -1, monto: -1 } },
    {
      $group: {
        _id: '$_id.agencia_id',
        cantidad_reservas: { $sum: '$cantidad' },
        monto_total: { $sum: '$monto' },
        producto_top_id: { $first: '$_id.producto_id' },
      },
    },
    { $sort: { cantidad_reservas: -1, monto_total: -1 } },
    { $limit: itemsLimit },
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
      $lookup: {
        from: productoCollection(),
        localField: 'producto_top_id',
        foreignField: '_id',
        as: 'producto_info',
      },
    },
    { $unwind: { path: '$producto_info', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        nombre_agencia: { $ifNull: ['$agencia_info.nombre', 'Agencia desconocida'] },
        cantidad_reservas: 1,
        monto_total: 1,
        producto_mas_reservado: { $ifNull: ['$producto_info.nombre', 'N/A'] },
      },
    },
  ];

  const resultados = await Reserva.aggregate(pipeline);

  return resultados.map((r, i) => ({
    posicion: i + 1,
    nombre_agencia: r.nombre_agencia,
    cantidad_reservas: r.cantidad_reservas,
    monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
    producto_mas_reservado: r.producto_mas_reservado,
  }));
}

exports.getRankingAgencias = async (req, res, next) => {
  try {
    const { desde, hasta, limit } = req.query;
    const itemsLimit = parseInt(limit, 10) || 10;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

    const data = await fetchRankingAgenciasData(mayoristaId, fechaInicio, fechaFin, itemsLimit);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getMayoristaDashboard = async (req, res, next) => {
  try {
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const cotLookup = lookupCotizacionStages({ 'cot.mayorista_id': mayoristaId });

    const [
      reservasActivasAgg,
      ingresosMesData,
      agenciasActivasAgg,
      cotizacionesPendientes,
      productoTopData,
      pagosPorConfirmarAgg,
    ] = await Promise.all([
      Reserva.aggregate([
        ...cotLookup,
        { $match: { estado: { $in: ['pendiente_pago', 'pago_informado'] } } },
        { $count: 'total' },
      ]),
      Reserva.aggregate([
        ...cotLookup,
        {
          $match: {
            estado: { $ne: 'cancelada' },
            created_at: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$cot.precio_total' } } },
      ]),
      Reserva.aggregate([
        ...cotLookup,
        { $match: { estado: { $ne: 'cancelada' } } },
        { $group: { _id: '$cot.agencia_id' } },
        { $count: 'total' },
      ]),
      Cotizacion.countDocuments({ mayorista_id: mayoristaId, estado: 'pendiente' }),
      Reserva.aggregate([
        ...cotLookup,
        {
          $match: {
            estado: { $ne: 'cancelada' },
            created_at: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        { $group: { _id: '$cot.producto_id', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: productoCollection(),
            localField: '_id',
            foreignField: '_id',
            as: 'prod',
          },
        },
        { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      ]),
      Reserva.aggregate([
        ...cotLookup,
        { $match: { estado: 'pago_informado' } },
        { $count: 'total' },
      ]),
    ]);

    const reservasActivas = reservasActivasAgg[0]?.total ?? 0;
    const ingresos_mes =
      ingresosMesData.length > 0 && ingresosMesData[0].total
        ? parseFloat(ingresosMesData[0].total.toString())
        : 0;
    const agenciasActivas = agenciasActivasAgg[0]?.total ?? 0;
    const pagosPorConfirmar = pagosPorConfirmarAgg[0]?.total ?? 0;
    const producto_top_mes =
      productoTopData.length > 0 && productoTopData[0].prod ? productoTopData[0].prod.nombre : null;

    res.json({
      success: true,
      data: {
        reservas_activas: reservasActivas,
        ingresos_mes,
        agencias_activas: agenciasActivas,
        producto_top: producto_top_mes
          ? { nombre: producto_top_mes, ventas: productoTopData[0].count }
          : null,
        cotizaciones_pendientes: cotizacionesPendientes,
        pagos_por_confirmar: pagosPorConfirmar,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getAgenciaDashboard = async (req, res, next) => {
  try {
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);
    const agenciaId = new mongoose.Types.ObjectId(req.usuario.agencia_id);

    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 1, true);

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const cotLookup = lookupCotizacionStages({
      'cot.mayorista_id': mayoristaId,
      'cot.agencia_id': agenciaId,
    });

    const [reservasActivasAgg, gastoMesData, cotizacionesPendientes, cotizacionesAprobadas, historialData] =
      await Promise.all([
        Reserva.aggregate([
          ...cotLookup,
          { $match: { estado: { $in: ['pendiente_pago', 'pagada'] } } },
          { $count: 'total' },
        ]),
        Reserva.aggregate([
          ...cotLookup,
          {
            $match: {
              estado: { $ne: 'cancelada' },
              created_at: { $gte: startOfMonth, $lte: endOfMonth },
            },
          },
          { $group: { _id: null, total: { $sum: '$cot.precio_total' } } },
        ]),
        Cotizacion.countDocuments({
          mayorista_id: mayoristaId,
          agencia_id: agenciaId,
          estado: 'pendiente',
        }),
        Cotizacion.countDocuments({
          mayorista_id: mayoristaId,
          agencia_id: agenciaId,
          estado: 'aprobada',
        }),
        Reserva.aggregate([
          ...cotLookup,
          {
            $match: {
              estado: { $ne: 'cancelada' },
              created_at: { $gte: fechaInicio, $lte: fechaFin },
            },
          },
          {
            $group: {
              _id: {
                year: { $year: '$created_at' },
                month: { $month: '$created_at' },
              },
              cantidad: { $sum: 1 },
              monto: { $sum: '$cot.precio_total' },
            },
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          {
            $project: {
              _id: 0,
              mes: {
                $concat: [
                  { $toString: '$_id.year' },
                  '-',
                  {
                    $cond: {
                      if: { $lt: ['$_id.month', 10] },
                      then: { $concat: ['0', { $toString: '$_id.month' }] },
                      else: { $toString: '$_id.month' },
                    },
                  },
                ],
              },
              cantidad: 1,
              monto: 1,
            },
          },
        ]),
      ]);

    const gasto_total_mes =
      gastoMesData.length > 0 && gastoMesData[0].total
        ? parseFloat(gastoMesData[0].total.toString())
        : 0;

    const historial = historialData.map((h) => ({
      mes: h.mes,
      cantidad: h.cantidad,
      monto_total: h.monto ? parseFloat(h.monto.toString()) : 0,
    }));

    res.json({
      success: true,
      data: {
        reservas_activas: reservasActivasAgg[0]?.total ?? 0,
        gasto_mes: gasto_total_mes,
        cotizaciones_pendientes: cotizacionesPendientes,
        cotizaciones_aprobadas: cotizacionesAprobadas,
        historial_reservas: historial,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// EXPORTACIÓN DE REPORTES A PDF
// ==========================================

const PERIODO_LABEL = { dia: 'Día', mes: 'Mes', anio: 'Año' };

const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatMoney = (value) => moneyFormatter.format(Number(value) || 0);

const slug = (str) =>
  String(str || '')
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code < 0x300 || code > 0x36f; // descarta marcas diacríticas combinantes
    })
    .join('')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'reporte';

// ==========================================
// GRÁFICO DE INGRESOS (dibujado con primitivas vectoriales de pdfkit)
// ==========================================

const CHART_COLOR = '#2F9A62';
const CHART_GRID_COLOR = '#dddddd';
const CHART_LABEL_COLOR = '#666666';

/**
 * Redondea hacia arriba a un número "prolijo" (1/2/5 * 10^n) para usar como
 * techo del eje Y, evitando montos como $1873.42 en las etiquetas de grilla.
 */
function niceCeil(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const residual = value / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

/**
 * Genera todos los "baldes" de tiempo del periodo (horas del día, días del
 * mes o meses del año) rellenando con cero los que no tienen ingresos, para
 * que la forma del gráfico coincida con la que se ve en la pantalla de
 * Reportes (que hace el mismo relleno en el frontend).
 */
function buildBucketsForPeriodo(periodoConfig) {
  let ids;
  if (periodoConfig.periodo === 'dia') {
    ids = Array.from({ length: 24 }, (_, i) => i);
  } else if (periodoConfig.periodo === 'mes') {
    const [year, month] = periodoConfig.valor.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    ids = Array.from({ length: lastDay }, (_, i) => i + 1);
  } else {
    ids = Array.from({ length: 12 }, (_, i) => i + 1);
  }

  return ids.map((id) => ({ label: periodoConfig.labelFor(id), fecha: periodoConfig.fechaFor(id) }));
}

function buildChartSeries(periodoConfig, puntos) {
  const buckets = buildBucketsForPeriodo(periodoConfig);
  const ingresosPorFecha = new Map(puntos.map((p) => [p.fecha, p.ingresos]));
  return buckets.map((b) => ({ label: b.label, ingresos: ingresosPorFecha.get(b.fecha) || 0 }));
}

/**
 * Dibuja un gráfico de área (línea + relleno) con los ingresos por periodo,
 * a partir de la posición actual de `doc.y`. Reserva una columna a la
 * izquierda para las etiquetas del eje Y y submuestrea las etiquetas del eje
 * X para que no se amontonen.
 */
function drawIngresosChart(doc, { series, formatMoney, height = 160 }) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = doc.y;

  const hasData = series.length > 0 && series.some((s) => s.ingresos > 0);

  if (!hasData) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#888')
      .text('Sin datos', startX, top + height / 2 - 5, { width: usableWidth, align: 'center' });
    doc.fillColor('#000');
    doc.x = startX;
    doc.y = top + height + 10;
    return;
  }

  const maxVal = niceCeil(Math.max(...series.map((s) => s.ingresos)));
  const divisions = 4;
  const labelColWidth = 70;
  const plotX = startX + labelColWidth;
  const plotWidth = usableWidth - labelColWidth;

  doc.font('Helvetica').fontSize(8);
  for (let i = 0; i <= divisions; i++) {
    const value = (maxVal / divisions) * (divisions - i);
    const y = top + (height / divisions) * i;
    doc.fillColor(CHART_LABEL_COLOR).text(formatMoney(value), startX, y - 4, {
      width: labelColWidth - 8,
      align: 'right',
    });
    doc.strokeColor(CHART_GRID_COLOR).lineWidth(0.5).moveTo(plotX, y).lineTo(plotX + plotWidth, y).stroke();
  }

  const n = series.length;
  const stepX = n > 1 ? plotWidth / (n - 1) : 0;
  const points = series.map((s, i) => ({
    x: n > 1 ? plotX + stepX * i : plotX + plotWidth / 2,
    y: top + height - (s.ingresos / maxVal) * height,
  }));

  doc.save();
  doc.fillColor(CHART_COLOR).fillOpacity(0.15);
  doc.moveTo(points[0].x, top + height);
  points.forEach((p) => doc.lineTo(p.x, p.y));
  doc.lineTo(points[points.length - 1].x, top + height);
  doc.fill();
  doc.restore();

  doc.strokeColor(CHART_COLOR).lineWidth(2);
  doc.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((p) => doc.lineTo(p.x, p.y));
  doc.stroke();

  doc
    .strokeColor('#999999')
    .lineWidth(0.75)
    .moveTo(plotX, top + height)
    .lineTo(plotX + plotWidth, top + height)
    .stroke();

  const maxLabels = 8;
  const stride = Math.max(1, Math.ceil(n / maxLabels));
  doc.font('Helvetica').fontSize(7).fillColor(CHART_LABEL_COLOR);
  series.forEach((s, i) => {
    if (i % stride !== 0 && i !== n - 1) return;
    const p = points[i];
    doc.text(s.label, p.x - 15, top + height + 4, { width: 30, align: 'center' });
  });

  doc.fillColor('#000').fillOpacity(1);
  doc.x = startX;
  doc.y = top + height + 20;
}

/**
 * @route   GET /api/v1/reportes/exportar
 * @desc    Genera un PDF con el resumen de ingresos, ranking de agencias y
 *          productos más vendidos para el periodo seleccionado (mismo corte
 *          de datos que se ve en la pantalla de Reportes).
 * @access  Private (Mayorista)
 */
exports.exportarReportePDF = async (req, res, next) => {
  try {
    const periodoConfig = parsePeriodoIngresos(req.query.periodo, req.query.valor);

    if (!periodoConfig) {
      return res.status(400).json({
        success: false,
        message: 'Periodo o valor invalido. Use periodo=dia|mes|anio y valor=YYYY-MM-DD|YYYY-MM|YYYY.',
      });
    }

    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

    const [mayorista, ingresosData, rankingAgencias, productosTop] = await Promise.all([
      Mayorista.findById(mayoristaId).select('nombre').lean(),
      fetchIngresosData(mayoristaId, periodoConfig),
      fetchRankingAgenciasData(mayoristaId, periodoConfig.fechaInicio, periodoConfig.fechaFin, 10),
      fetchProductosTopData(mayoristaId, periodoConfig.fechaInicio, periodoConfig.fechaFin),
    ]);

    const nombreMayorista = mayorista?.nombre || 'Mayorista';
    const periodoLabel = PERIODO_LABEL[periodoConfig.periodo] || periodoConfig.periodo;
    const filename = `reporte_${slug(nombreMayorista)}_${periodoConfig.valor}.pdf`;
    const totalReservas = ingresosData.puntos.reduce((sum, p) => sum + (p.reservas || 0), 0);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('TourConnect — Reporte de Actividad');
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').fillColor('#555');
    doc.text(nombreMayorista);
    doc.text(`Periodo: ${periodoLabel} — ${periodoConfig.valor}`);
    doc.text(`Generado el: ${new Date().toLocaleString('es-AR')}`);
    doc.fillColor('#000');
    doc.moveDown(1.2);

    doc.fontSize(14).font('Helvetica-Bold').text('Resumen de Ingresos');
    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Ingresos del periodo: ${formatMoney(ingresosData.total_ingresos)}`);
    doc.text(`Reservas con ingresos: ${totalReservas}`);
    doc.moveDown(1.2);

    const chartHeight = 160;
    if (doc.y + 20 + chartHeight + 20 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    doc.fontSize(14).font('Helvetica-Bold').text('Ingresos por Período');
    doc.moveDown(0.4);
    drawIngresosChart(doc, {
      series: buildChartSeries(periodoConfig, ingresosData.puntos),
      formatMoney,
      height: chartHeight,
    });
    doc.moveDown(0.8);

    doc.fontSize(14).font('Helvetica-Bold').text('Ranking de Agencias');
    doc.moveDown(0.4);
    drawTable(
      doc,
      ['#', 'Agencia', 'Reservas', 'Monto Facturado'],
      rankingAgencias.map((a) => [a.posicion, a.nombre_agencia, a.cantidad_reservas, formatMoney(a.monto_total)]),
      [30, 235, 70, 155]
    );

    doc.moveDown(0.8);
    doc.fontSize(14).font('Helvetica-Bold').text('Productos Más Vendidos');
    doc.moveDown(0.4);
    drawTable(
      doc,
      ['Producto', 'Tipo', 'Reservas', 'Ingresos'],
      productosTop.map((p) => [p.nombre, p.tipo, p.cantidad_reservas, formatMoney(p.monto_total)]),
      [200, 100, 75, 115]
    );

    doc.end();
  } catch (error) {
    next(error);
  }
};
