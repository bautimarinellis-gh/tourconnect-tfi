const AuditLog = require('../models/AuditLog');
const { ACCIONES } = require('../models/AuditLog');
const PDFDocument = require('pdfkit');
const { drawTable } = require('../utils/pdfHelpers');

const PAGE_LIMIT_MAX = 100;
const PAGE_LIMIT_DEFAULT = 25;
const TRAZABILIDAD_LIMIT = 500;

/**
 * Arma y valida la query de auditoría a partir de los filtros de la request.
 * Usado tanto por el listado (getAuditoria) como por la exportación a PDF,
 * para no duplicar la validación de filtros entre ambos.
 *
 * Scoping por defecto: cada usuario (admin incluido) ve solo los eventos que
 * él mismo ejecutó (usuario_id = su propio id).
 *
 * Excepción — trazabilidad de una entidad: si se piden entidad_afectada +
 * entidad_id y quien pregunta es mayorista, se devuelve la trazabilidad
 * COMPLETA de ese elemento dentro de su tenant (todos los actores, no solo
 * lo que el mayorista mismo hizo). Es la única forma de cumplir "trazabilidad
 * completa" cuando, por ejemplo, una reserva la crea la agencia y la cierra
 * el mayorista. Se restringe a mayorista porque es el único rol con
 * visibilidad legítima sobre todo el tenant; para los demás roles, el filtro
 * por entidad simplemente acota su propio historial a esa entidad.
 *
 * Trade-off documentado: los eventos registrados con usuario_id: null
 * (p. ej. LOGIN_FALLIDO con email inexistente) no son visibles para nadie
 * en la UI fuera del modo trazabilidad. Quedan en la colección como
 * evidencia forense consultable directamente en la base.
 *
 * @returns {{ query?: object, esTrazabilidadEntidad?: boolean, error?: string }}
 */
const construirQueryAuditoria = (req) => {
  const { id: usuario_id, rol, mayorista_id } = req.usuario;
  const { desde, hasta, accion, categoria, resultado, entidad_afectada, entidad_id } = req.query;

  const esTrazabilidadEntidad = Boolean(entidad_afectada && entidad_id && rol === 'mayorista');

  const query = esTrazabilidadEntidad
    ? { mayorista_id, entidad_afectada, entidad_id }
    : { usuario_id };

  if (!esTrazabilidadEntidad) {
    if (entidad_afectada) query.entidad_afectada = entidad_afectada;
    if (entidad_id) query.entidad_id = entidad_id;
  }

  if (desde || hasta) {
    query.timestamp = {};
    if (desde) query.timestamp.$gte = new Date(desde);
    if (hasta) {
      const hastaDate = new Date(hasta);
      hastaDate.setHours(23, 59, 59, 999);
      query.timestamp.$lte = hastaDate;
    }
  }

  if (accion) {
    if (!ACCIONES.includes(accion)) {
      return { error: `Acción '${accion}' no reconocida.` };
    }
    query.accion = accion;
  }

  if (categoria) {
    if (!['seguridad', 'negocio'].includes(categoria)) {
      return { error: "categoria debe ser 'seguridad' o 'negocio'." };
    }
    query.categoria = categoria;
  }

  if (resultado) {
    if (!['exitoso', 'fallido'].includes(resultado)) {
      return { error: "resultado debe ser 'exitoso' o 'fallido'." };
    }
    query.resultado = resultado;
  }

  return { query, esTrazabilidadEntidad };
};

/**
 * GET /api/v1/auditoria
 *
 * Filtros opcionales (query params):
 *   desde              ISO date  — timestamp >= desde
 *   hasta              ISO date  — timestamp <= hasta
 *   accion             string    — valor del enum ACCIONES
 *   categoria          string    — 'seguridad' | 'negocio'
 *   resultado          string    — 'exitoso' | 'fallido'
 *   entidad_afectada   string    — nombre del modelo (p. ej. 'Reserva')
 *   entidad_id         string    — id del documento afectado
 *   page               number    — 1-based (default 1, ignorado en modo trazabilidad)
 *   limit              number    — max 100 (default 25, ignorado en modo trazabilidad)
 *
 * Si entidad_afectada + entidad_id vienen completos y el rol es mayorista,
 * responde en "modo trazabilidad": todos los eventos de esa entidad dentro
 * del tenant, sin paginar, ordenados cronológicamente ascendente (estado
 * original → transformaciones).
 */
exports.getAuditoria = async (req, res, next) => {
  try {
    const { query, esTrazabilidadEntidad, error } = construirQueryAuditoria(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const { page = '1', limit = String(PAGE_LIMIT_DEFAULT) } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(PAGE_LIMIT_MAX, Math.max(1, parseInt(limit, 10) || PAGE_LIMIT_DEFAULT));
    const sortOrder = esTrazabilidadEntidad ? 1 : -1;

    let find = AuditLog.find(query)
      .select('-__v')
      .populate('usuario_id', 'email rol -_id')
      .populate('mayorista_id', 'nombre -_id')
      .populate('agencia_id', 'nombre -_id')
      .sort({ timestamp: sortOrder });

    if (esTrazabilidadEntidad) {
      find = find.limit(TRAZABILIDAD_LIMIT);
    } else {
      find = find.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const [logs, total] = await Promise.all([
      find.lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        esTrazabilidadEntidad,
        paginacion: esTrazabilidadEntidad
          ? { total, pagina: 1, limite: total || 1, paginas: 1 }
          : { total, pagina: pageNum, limite: limitNum, paginas: Math.ceil(total / limitNum) },
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

// ==========================================
// EXPORTACIÓN DE REPORTES DE AUDITORÍA A PDF
// ==========================================

const truncateId = (id) => (id ? String(id).slice(-8) : null);

/**
 * GET /api/v1/auditoria/exportar
 *
 * Mismos filtros y misma semántica de scoping que GET /api/v1/auditoria
 * (ver construirQueryAuditoria). Sin paginar: hasta TRAZABILIDAD_LIMIT filas.
 *
 * Dos reportes en un solo endpoint, según los parámetros recibidos:
 *   - Sin entidad_afectada/entidad_id: reporte general de auditoría (la
 *     actividad propia del usuario, con los filtros aplicados).
 *   - Con entidad_afectada + entidad_id (mayorista): reporte de trazabilidad
 *     completa de esa entidad — el ítem "trazabilidad" del anexo 14.3 en
 *     forma de reporte exportable.
 */
exports.exportarAuditoriaPDF = async (req, res, next) => {
  try {
    const { query, esTrazabilidadEntidad, error } = construirQueryAuditoria(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const logs = await AuditLog.find(query)
      .select('-__v')
      .populate('usuario_id', 'email rol -_id')
      .sort({ timestamp: esTrazabilidadEntidad ? 1 : -1 })
      .limit(TRAZABILIDAD_LIMIT)
      .lean();

    const { entidad_afectada, entidad_id } = req.query;
    const filename = esTrazabilidadEntidad
      ? `trazabilidad_${entidad_afectada}_${truncateId(entidad_id)}.pdf`
      : `auditoria_${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text(
      esTrazabilidadEntidad
        ? `TourConnect — Trazabilidad de ${entidad_afectada} #${truncateId(entidad_id)}`
        : 'TourConnect — Reporte de Auditoría'
    );
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').fillColor('#555');
    doc.text(`Generado por: ${req.usuario.email ?? req.usuario.id}`);
    doc.text(`Generado el: ${new Date().toLocaleString('es-AR')}`);

    if (!esTrazabilidadEntidad) {
      const filtrosAplicados = ['desde', 'hasta', 'accion', 'categoria', 'resultado']
        .filter((k) => req.query[k])
        .map((k) => `${k}: ${req.query[k]}`)
        .join('  |  ');
      doc.text(`Filtros: ${filtrosAplicados || 'ninguno'}`);
    }
    doc.fillColor('#000');
    doc.moveDown(1.2);

    drawTable(
      doc,
      ['Fecha / hora', 'Acción', 'Resultado', 'Usuario', 'Entidad', 'IP'],
      logs.map((l) => [
        new Date(l.timestamp).toLocaleString('es-AR'),
        l.accion,
        l.resultado,
        l.usuario_id?.email ?? '—',
        l.entidad_afectada ? `${l.entidad_afectada} #${truncateId(l.entidad_id)}` : '—',
        l.ip_address ?? '—',
      ]),
      [85, 95, 50, 100, 100, 65]
    );

    doc.end();
  } catch (error) {
    next(error);
  }
};
