const AuditLog = require('../models/AuditLog');
const { ACCIONES } = require('../models/AuditLog');

const PAGE_LIMIT_MAX = 100;
const PAGE_LIMIT_DEFAULT = 25;

/**
 * GET /api/v1/auditoria
 *
 * Filtros opcionales (query params):
 *   desde       ISO date  — timestamp >= desde
 *   hasta       ISO date  — timestamp <= hasta
 *   accion      string    — valor del enum ACCIONES
 *   categoria   string    — 'seguridad' | 'negocio'
 *   resultado   string    — 'exitoso' | 'fallido'
 *   usuario_id  ObjectId  — solo admin puede filtrar por usuario arbitrario
 *   page        number    — 1-based (default 1)
 *   limit       number    — max 100 (default 25)
 *
 * Scoping automático por rol:
 *   admin     → ve toda la plataforma
 *   mayorista → ve solo su mayorista_id
 *   agencia   → ve solo su agencia_id dentro de su mayorista_id
 */
exports.getAuditoria = async (req, res, next) => {
  try {
    const { rol, id: usuario_id, mayorista_id, agencia_id } = req.usuario;
    const {
      desde,
      hasta,
      accion,
      categoria,
      resultado,
      usuario_id: filtroUsuario,
      page = '1',
      limit = String(PAGE_LIMIT_DEFAULT),
    } = req.query;

    // ── Construcción de query ────────────────────────────────────────────
    const query = {};

    // Scoping por rol — regla central de visibilidad
    if (rol === 'mayorista') {
      query.mayorista_id = mayorista_id;
    } else if (rol === 'agencia') {
      query.mayorista_id = mayorista_id;
      query.agencia_id = agencia_id;
    }
    // admin: sin restricción de tenant

    // Filtro de fechas
    if (desde || hasta) {
      query.timestamp = {};
      if (desde) query.timestamp.$gte = new Date(desde);
      if (hasta) {
        const hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);
        query.timestamp.$lte = hastaDate;
      }
    }

    // Filtros opcionales validados
    if (accion) {
      if (!ACCIONES.includes(accion)) {
        return res.status(400).json({ success: false, message: `Acción '${accion}' no reconocida.` });
      }
      query.accion = accion;
    }

    if (categoria) {
      if (!['seguridad', 'negocio'].includes(categoria)) {
        return res.status(400).json({ success: false, message: "categoria debe ser 'seguridad' o 'negocio'." });
      }
      query.categoria = categoria;
    }

    if (resultado) {
      if (!['exitoso', 'fallido'].includes(resultado)) {
        return res.status(400).json({ success: false, message: "resultado debe ser 'exitoso' o 'fallido'." });
      }
      query.resultado = resultado;
    }

    // Solo admin puede filtrar por usuario arbitrario
    if (filtroUsuario) {
      if (rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'No tenés permisos para filtrar por usuario.' });
      }
      query.usuario_id = filtroUsuario;
    }

    // ── Paginación ───────────────────────────────────────────────────────
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(PAGE_LIMIT_MAX, Math.max(1, parseInt(limit, 10) || PAGE_LIMIT_DEFAULT));
    const skip = (pageNum - 1) * limitNum;

    // ── Ejecución paralela de datos + conteo ────────────────────────────
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .select('-__v')
        .populate('usuario_id', 'email rol -_id')
        .populate('mayorista_id', 'nombre -_id')
        .populate('agencia_id', 'nombre -_id')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        paginacion: {
          total,
          pagina: pageNum,
          limite: limitNum,
          paginas: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/auditoria/:id
 * Detalle de un evento de auditoría. Valida scoping antes de devolver.
 */
exports.getAuditoriaById = async (req, res, next) => {
  try {
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const log = await AuditLog.findById(req.params.id)
      .select('-__v')
      .populate('usuario_id', 'email rol -_id')
      .populate('mayorista_id', 'nombre -_id')
      .populate('agencia_id', 'nombre -_id')
      .lean();

    if (!log) {
      return res.status(404).json({ success: false, message: 'Evento de auditoría no encontrado.' });
    }

    // Verificar que el solicitante tiene acceso al evento
    if (rol === 'mayorista') {
      if (!log.mayorista_id || log.mayorista_id._id.toString() !== mayorista_id.toString()) {
        return res.status(403).json({ success: false, message: 'No tenés permisos para ver este evento.' });
      }
    } else if (rol === 'agencia') {
      if (!log.agencia_id || log.agencia_id._id.toString() !== agencia_id.toString()) {
        return res.status(403).json({ success: false, message: 'No tenés permisos para ver este evento.' });
      }
    }

    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};
