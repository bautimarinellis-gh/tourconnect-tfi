const { classify } = require('../utils/intentClassifier');
const { execute } = require('../utils/queryExecutor');
const intentCatalog = require('../utils/intentCatalog');

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
        suggestions: classification.suggestions || [],
        metadata: {
          executed_at: new Date().toISOString(),
          query_time_ms: Date.now() - startTime,
        },
      });
    }

    // ── 4. Verificar permisos del intent ──────────────────────────────────
    const intentDef = intentCatalog[classification.intent];
    if (!intentDef || !intentDef.roles.includes(req.usuario?.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para ejecutar esta consulta.',
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
