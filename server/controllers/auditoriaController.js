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
 *   page        number    — 1-based (default 1)
 *   limit       number    — max 100 (default 25)
 *
 * Scoping: cada usuario (admin incluido) ve solo los eventos que él mismo
 * ejecutó (usuario_id = su propio id).
 *
 * Trade-off documentado: los eventos registrados con usuario_id: null
 * (p. ej. LOGIN_FALLIDO con email inexistente) no son visibles para nadie
 * en la UI. Quedan en la colección como evidencia forense consultable
 * directamente en la base.
 */
exports.getAuditoria = async (req, res, next) => {
  try {
    const { id: usuario_id } = req.usuario;
    const {
      desde,
      hasta,
      accion,
      categoria,
      resultado,
      page = '1',
      limit = String(PAGE_LIMIT_DEFAULT),
    } = req.query;

    // ── Construcción de query ────────────────────────────────────────────
    // Regla central de visibilidad: solo las acciones propias
    const query = { usuario_id };

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
 * Detalle de un evento de auditoría. Solo el usuario que ejecutó la acción
 * puede verlo: la propiedad se verifica en el filtro de la query (antes de
 * popular — el populate excluye el _id de usuario_id, así que un chequeo
 * posterior no sería posible). Si el evento no es suyo, responde 404 igual
 * que si no existiera, sin revelar su existencia.
 */
exports.getAuditoriaById = async (req, res, next) => {
  try {
    const log = await AuditLog.findOne({ _id: req.params.id, usuario_id: req.usuario.id })
      .select('-__v')
      .populate('usuario_id', 'email rol -_id')
      .populate('mayorista_id', 'nombre -_id')
      .populate('agencia_id', 'nombre -_id')
      .lean();

    if (!log) {
      return res.status(404).json({ success: false, message: 'Evento de auditoría no encontrado.' });
    }

    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};
