const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
const {
  lookupCotizacionStages,
  productoCollection,
  agenciaCollection,
} = require('../utils/reporteHelpers');

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

exports.getReservasPorMes = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

    const pipeline = [
      ...lookupCotizacionStages({
        'cot.mayorista_id': mayoristaId,
      }),
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
          cantidad_reservas: { $sum: 1 },
          monto_total: { $sum: '$cot.precio_total' },
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
          cantidad_reservas: 1,
          monto_total: 1,
        },
      },
    ];

    const resultados = await Reserva.aggregate(pipeline);

    const data = resultados.map((r) => ({
      mes: r.mes,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getIngresosPorAgencia = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

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
          _id: '$cot.agencia_id',
          cantidad_reservas: { $sum: 1 },
          monto_total: { $sum: '$cot.precio_total' },
        },
      },
      { $sort: { monto_total: -1 } },
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
          nombre: { $ifNull: ['$agencia_info.nombre', 'Agencia desconocida'] },
          cantidad_reservas: 1,
          monto_total: 1,
        },
      },
    ];

    const resultados = await Reserva.aggregate(pipeline);

    const data = resultados.map((r) => ({
      nombre: r.nombre,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getIngresosPorProducto = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

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

    const data = resultados.map((r) => ({
      nombre: r.nombre,
      tipo: r.tipo,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getRankingAgencias = async (req, res, next) => {
  try {
    const { desde, hasta, limit } = req.query;
    const itemsLimit = parseInt(limit, 10) || 10;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);

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

    const data = resultados.map((r, i) => ({
      posicion: i + 1,
      nombre_agencia: r.nombre_agencia,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
      producto_mas_reservado: r.producto_mas_reservado,
    }));

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

    const [reservasActivasAgg, gastoMesData, cotizacionesPendientes, historialData] =
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
        historial_reservas: historial,
      },
    });
  } catch (err) {
    next(err);
  }
};
