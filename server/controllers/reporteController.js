const mongoose = require('mongoose');
const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');

// Helper para obtener fechas según los requerimientos
const getDefaultFechas = (desde, hasta, mesesAtras = 6, paraMesActual = false) => {
  let fechaInicio, fechaFin;

  if (desde && hasta) {
    fechaInicio = new Date(desde);
    fechaFin = new Date(hasta);
    // Establecer el fin del día para 'hasta'
    fechaFin.setUTCHours(23, 59, 59, 999);
  } else if (paraMesActual) {
    const now = new Date();
    fechaInicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    fechaFin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  } else {
    const now = new Date();
    fechaFin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    // Retiene desde el primer día del mes hace "mesesAtras - 1"
    fechaInicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (mesesAtras - 1), 1));
  }
  
  return { fechaInicio, fechaFin };
};

// =========================================================
// ADMIN ENDPOINTS
// =========================================================

exports.getAdminDashboard = async (req, res, next) => {
  try {
    const [totalMayoristas, totalAgencias, totalReservas, cotizacionesPendientes, ultimosMayoristas] = await Promise.all([
      Mayorista.countDocuments(),
      Agencia.countDocuments({ activo: true }),
      Reserva.countDocuments({ estado: { $ne: 'cancelada' } }),
      Cotizacion.countDocuments({ estado: 'pendiente' }),
      Mayorista.find()
        .sort({ created_at: -1 })
        .limit(10)
        .populate('usuario_id', 'email')
        .lean()
    ]);

    const kpis = {
      mayoristas: totalMayoristas,
      agencias: totalAgencias,
      reservas: totalReservas,
      cotizacionesPendientes
    };

    const ultimos = ultimosMayoristas.map(m => ({
      _id: m._id,
      nombre: m.nombre,
      email_contacto: m.usuario_id?.email ?? '-',
      activo: m.activo
    }));

    res.json({
      success: true,
      data: { kpis, ultimosMayoristas: ultimos }
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================
// MAYORISTA ENDPOINTS
// =========================================================

exports.getReservasPorMes = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 6, false);

    const matchStage = {
      mayorista_id: new mongoose.Types.ObjectId(req.mayorista_id),
      estado: { $ne: 'cancelada' },
      created_at: { $gte: fechaInicio, $lte: fechaFin }
    };

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$created_at" },
            month: { $month: "$created_at" }
          },
          cantidad_reservas: { $sum: 1 },
          monto_total: { $sum: "$precio_final" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      {
        $project: {
          _id: 0,
          mes: { 
            $concat: [
              { $toString: "$_id.year" }, 
              "-", 
              { $cond: { if: { $lt: ["$_id.month", 10] }, then: { $concat: ["0", { $toString: "$_id.month" }] }, else: { $toString: "$_id.month" } } }
            ]
          },
          cantidad_reservas: 1,
          monto_total: 1
        }
      }
    ];

    const resultados = await Reserva.aggregate(pipeline);

    const data = resultados.map(r => ({
      mes: r.mes,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0
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

    const pipeline = [
      {
        $match: {
          mayorista_id: new mongoose.Types.ObjectId(req.mayorista_id),
          estado: { $ne: 'cancelada' },
          created_at: { $gte: fechaInicio, $lte: fechaFin }
        }
      },
      {
        $group: {
          _id: "$agencia_id",
          cantidad_reservas: { $sum: 1 },
          monto_total: { $sum: "$precio_final" }
        }
      },
      {
        $sort: { monto_total: -1 } // Ordenar por suma Decimal128 en BD
      },
      {
        $lookup: {
          from: "agencias",
          localField: "_id",
          foreignField: "_id",
          as: "agencia_info"
        }
      },
      { $unwind: { path: "$agencia_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          nombre: { $ifNull: ["$agencia_info.nombre", "Agencia desconocida"] },
          cantidad_reservas: 1,
          monto_total: 1
        }
      }
    ];

    const resultados = await Reserva.aggregate(pipeline);

    const data = resultados.map(r => ({
      nombre: r.nombre,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0
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

    const pipeline = [
      {
        $match: {
          mayorista_id: new mongoose.Types.ObjectId(req.mayorista_id),
          estado: { $ne: 'cancelada' },
          created_at: { $gte: fechaInicio, $lte: fechaFin }
        }
      },
      {
        $group: {
          _id: "$producto_id",
          cantidad_reservas: { $sum: 1 },
          monto_total: { $sum: "$precio_final" }
        }
      },
      {
        $sort: { monto_total: -1 }
      },
      {
        $lookup: {
          from: "productos",
          localField: "_id",
          foreignField: "_id",
          as: "producto_info"
        }
      },
      { $unwind: { path: "$producto_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          nombre: { $ifNull: ["$producto_info.nombre", "Producto desconocido"] },
          tipo: { $ifNull: ["$producto_info.tipo", "N/A"] },
          cantidad_reservas: 1,
          monto_total: 1
        }
      }
    ];

    const resultados = await Reserva.aggregate(pipeline);

    const data = resultados.map(r => ({
      nombre: r.nombre,
      tipo: r.tipo,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0
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

    const pipeline = [
      {
        $match: {
          mayorista_id: new mongoose.Types.ObjectId(req.mayorista_id),
          estado: { $ne: 'cancelada' },
          created_at: { $gte: fechaInicio, $lte: fechaFin }
        }
      },
      {
        $group: {
          _id: { agencia_id: "$agencia_id", producto_id: "$producto_id" },
          cantidad: { $sum: 1 },
          monto: { $sum: "$precio_final" }
        }
      },
      // Ordenamos para que, al agrupar, el primer producto que tome $first sea el que tiene max cantidad
      { $sort: { cantidad: -1, monto: -1 } },
      {
        $group: {
          _id: "$_id.agencia_id",
          cantidad_reservas: { $sum: "$cantidad" },
          monto_total: { $sum: "$monto" },
          producto_top_id: { $first: "$_id.producto_id" }
        }
      },
      { $sort: { cantidad_reservas: -1, monto_total: -1 } },
      { $limit: itemsLimit },
      {
        $lookup: {
          from: "agencias",
          localField: "_id",
          foreignField: "_id",
          as: "agencia_info"
        }
      },
      { $unwind: { path: "$agencia_info", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "productos",
          localField: "producto_top_id",
          foreignField: "_id",
          as: "producto_info"
        }
      },
      { $unwind: { path: "$producto_info", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          nombre_agencia: { $ifNull: ["$agencia_info.nombre", "Agencia desconocida"] },
          cantidad_reservas: 1,
          monto_total: 1,
          producto_mas_reservado: { $ifNull: ["$producto_info.nombre", "N/A"] }
        }
      }
    ];

    const resultados = await Reserva.aggregate(pipeline);

    const data = resultados.map((r, i) => ({
      posicion: i + 1,
      nombre_agencia: r.nombre_agencia,
      cantidad_reservas: r.cantidad_reservas,
      monto_total: r.monto_total ? parseFloat(r.monto_total.toString()) : 0,
      producto_mas_reservado: r.producto_mas_reservado
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

    const [
      reservasActivas,
      ingresosMesData,
      agenciasActivas,
      cotizacionesPendientes,
      productoTopData,
      pagosPorConfirmar
    ] = await Promise.all([
      // reservas activas (pendiente_pago o pago_informado)
      Reserva.countDocuments({ mayorista_id: mayoristaId, estado: { $in: ['pendiente_pago', 'pago_informado'] } }),
      
      // ingresos del mes actual
      Reserva.aggregate([
        {
          $match: {
            mayorista_id: mayoristaId,
            estado: { $ne: 'cancelada' },
            created_at: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: "$precio_final" } } }
      ]),

      // agencias activas: consideramos a aquellas que han emitido alguna reserva no cancelada en toda su historia, o al menos en el sistema total. 
      // Si la métrica requiere "agencias unidas" o algo similar, podemos contar distinct de la DB.
      Reserva.distinct("agencia_id", { mayorista_id: mayoristaId, estado: { $ne: 'cancelada' } }),

      // cotizaciones pendientes sin respuesta
      Cotizacion.countDocuments({ mayorista_id: mayoristaId, estado: 'pendiente' }),

      // producto con más reservas del mes
      Reserva.aggregate([
        {
           $match: {
              mayorista_id: mayoristaId,
              estado: { $ne: 'cancelada' },
              created_at: { $gte: startOfMonth, $lte: endOfMonth }
           }
        },
        { $group: { _id: "$producto_id", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
        {
           $lookup: {
              from: "productos",
              localField: "_id",
              foreignField: "_id",
              as: "prod"
           }
        },
        { $unwind: { path: "$prod", preserveNullAndEmptyArrays: true } }
      ]),

      // pagos informados por agencias esperando confirmación
      Reserva.countDocuments({ mayorista_id: mayoristaId, estado: 'pago_informado' })
    ]);

    const ingresos_mes = ingresosMesData.length > 0 && ingresosMesData[0].total ? parseFloat(ingresosMesData[0].total.toString()) : 0;
    const producto_top_mes = productoTopData.length > 0 && productoTopData[0].prod ? productoTopData[0].prod.nombre : null;

    res.json({
      success: true,
      data: {
        reservas_activas: reservasActivas,
        ingresos_mes,
        agencias_activas: agenciasActivas.length,
        producto_top: producto_top_mes ? { nombre: producto_top_mes, ventas: productoTopData[0].count } : null,
        cotizaciones_pendientes: cotizacionesPendientes,
        pagos_por_confirmar: pagosPorConfirmar
      }
    });
  } catch (err) {
    next(err);
  }
};

// =========================================================
// AGENCIA ENDPOINTS
// =========================================================

exports.getAgenciaDashboard = async (req, res, next) => {
  try {
    const mayoristaId = new mongoose.Types.ObjectId(req.mayorista_id);
    const agenciaId = new mongoose.Types.ObjectId(req.usuario.agencia_id);

    const { desde, hasta } = req.query;
    const { fechaInicio, fechaFin } = getDefaultFechas(desde, hasta, 1, true); // por defecto: mes actual

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const [
      reservasActivas,
      gastoMesData,
      cotizacionesPendientes,
      historialData
    ] = await Promise.all([
      // reservas activas (estado=pendiente_pago|pagada) globalmente
      Reserva.countDocuments({
        mayorista_id: mayoristaId,
        agencia_id: agenciaId,
        estado: { $in: ['pendiente_pago', 'pagada'] }
      }),

      // gasto total del mes actual (independiente del filtro desde/hasta que afectará solo a reservas? El prompt dice "gasto del mes actual" así como KPI fijo)
      Reserva.aggregate([
        {
          $match: {
            mayorista_id: mayoristaId,
            agencia_id: agenciaId,
            estado: { $ne: 'cancelada' },
            created_at: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        { $group: { _id: null, total: { $sum: "$precio_final" } } }
      ]),

      // cotizaciones pendientes propias
      Cotizacion.countDocuments({
        mayorista_id: mayoristaId,
        agencia_id: agenciaId,
        estado: 'pendiente'
      }),

      // historial de reservas agrupado por mes, aplicando los filtros de fecha.
      Reserva.aggregate([
        {
          $match: {
            mayorista_id: mayoristaId,
            agencia_id: agenciaId,
            estado: { $ne: 'cancelada' },
            created_at: { $gte: fechaInicio, $lte: fechaFin }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$created_at" },
              month: { $month: "$created_at" }
            },
            cantidad: { $sum: 1 },
            monto: { $sum: "$precio_final" }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        {
          $project: {
            _id: 0,
            mes: { 
              $concat: [
                { $toString: "$_id.year" }, 
                "-", 
                { $cond: { if: { $lt: ["$_id.month", 10] }, then: { $concat: ["0", { $toString: "$_id.month" }] }, else: { $toString: "$_id.month" } } }
              ]
            },
            cantidad: 1,
            monto: 1
          }
        }
      ])
    ]);

    const gasto_total_mes = gastoMesData.length > 0 && gastoMesData[0].total ? parseFloat(gastoMesData[0].total.toString()) : 0;
    
    const historial = historialData.map(h => ({
      mes: h.mes,
      cantidad: h.cantidad,
      monto_total: h.monto ? parseFloat(h.monto.toString()) : 0
    }));

    res.json({
      success: true,
      data: {
        reservas_activas: reservasActivas,
        gasto_mes: gasto_total_mes,
        cotizaciones_pendientes: cotizacionesPendientes,
        historial_reservas: historial
      }
    });
  } catch (err) {
    next(err);
  }
};
