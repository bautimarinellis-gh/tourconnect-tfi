const { classify } = require('../utils/intentClassifier');
const { execute } = require('../utils/queryExecutor');
const intentCatalog = require('../utils/intentCatalog');
const { registrarAuditoria } = require('../utils/auditService');

/** ¿El usuario tiene el permiso que pide la intención? */
const puedeConsultar = (req, intentDef) =>
  req.permisos instanceof Set && req.permisos.has(intentDef.permiso);

/**
 * @desc    Procesar una consulta del Asistente Inteligente
 * @route   POST /api/v1/assistant/query
 * @access  Private/Mayorista
 */
exports.query = async (req, res, next) => {
  const startTime = Date.now();

  try {
    // ── 1. Validar input ──────────────────────────────────────────────────
    const rawQuery = req.body?.query;

    if (!rawQuery || typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'La consulta no puede estar vacía.',
      });
    }

    // Sanitizar: trim + limitar largo + strip HTML básico
    const query = rawQuery
      .trim()
      .slice(0, 300)
      .replace(/<[^>]*>/g, '');

    // ── 2. Clasificar intent ──────────────────────────────────────────────
    const context = {
      rol: req.usuario?.rol,
      mayorista_id: req.mayorista_id,
    };

    const classification = classify(query, context);

    // ── 3. Manejar intent desconocido ─────────────────────────────────────
    if (classification.intent === 'unknown') {
      return res.json({
        success: true,
        intent: 'unknown',
        confidence: classification.confidence,
        message: 'No pude entender tu consulta. Podés preguntarme sobre:',
        // Solo se sugiere lo que el usuario puede consultar
        suggestions: (classification.suggestions || [])
          .filter((s) => puedeConsultar(req, intentCatalog[s.intent])),
        metadata: {
          executed_at: new Date().toISOString(),
          query_time_ms: Date.now() - startTime,
        },
      });
    }

    // ── 4. Verificar rol y permiso del intent ─────────────────────────────
    const intentDef = intentCatalog[classification.intent];
    if (!intentDef || !intentDef.roles.includes(req.usuario?.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para ejecutar esta consulta.',
      });
    }

    // Mismo permiso que protege la sección equivalente del sistema: el
    // asistente no puede ser una puerta trasera a datos que el rol no ve.
    if (!puedeConsultar(req, intentDef)) {
      registrarAuditoria({
        req,
        accion: 'ACCESO_DENEGADO',
        resultado: 'fallido',
        detalle: {
          permisos_requeridos: [intentDef.permiso],
          metodo: req.method,
          ruta: req.originalUrl,
          intent: classification.intent,
        },
      });

      return res.status(403).json({
        success: false,
        code: 'ASSISTANT_INTENT_FORBIDDEN',
        message: `Tu rol no incluye acceso a esta consulta (${intentDef.description.toLowerCase()}). `
          + 'Si la necesitás, pedíselo al administrador de tu empresa.',
      });
    }

    // ── 5. Ejecutar query (mayorista_id desde middleware, NUNCA del body) ──
    const result = await execute(
      classification.intent,
      classification.params,
      req.mayorista_id,
    );

    // ── 6. Log de la consulta ─────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify({
        type: 'assistant_query',
        timestamp: new Date().toISOString(),
        mayorista_id: req.mayorista_id,
        query_original: query,
        intent_clasificado: classification.intent,
        confidence: classification.confidence,
        matched_keywords: classification.matched_keywords,
        params: classification.params,
        results_count: result.data?.length ?? 0,
        total_ms: Date.now() - startTime,
        success: true,
      }));
    }

    // ── 7. Respuesta ──────────────────────────────────────────────────────
    return res.json({
      success: true,
      intent: classification.intent,
      confidence: classification.confidence,
      description: classification.description,
      visualization: intentDef.visualization,
      data: result.data,
      summary: result.summary,
      stat: result.stat || null,
      columns: result.columns || [],
      columnLabels: result.columnLabels || {},
      metadata: result.metadata,
    });

  } catch (error) {
    console.error(JSON.stringify({
      type: 'assistant_query_error',
      timestamp: new Date().toISOString(),
      mayorista_id: req.mayorista_id,
      error: error.message,
      stack: error.stack,
      total_ms: Date.now() - startTime,
    }));

    next(error);
  }
};
