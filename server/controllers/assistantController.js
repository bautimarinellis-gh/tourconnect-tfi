const { classify } = require('../utils/intentClassifier');
const { execute, describirPeriodo } = require('../utils/queryExecutor');
const intentCatalog = require('../utils/intentCatalog');
const { registrarAuditoria } = require('../utils/auditService');
const asistenteIA = require('../utils/asistenteIA');
const gemini = require('../utils/geminiService');
const { validarConsulta } = require('../utils/piezasConsulta');
const { ejecutarConsulta } = require('../utils/constructorConsultas');

// Cuántas preguntas anteriores se aceptan como contexto de seguimiento
const MAX_HISTORIAL = 3;

// Tipos de las columnas de las 6 consultas del modo básico, para que el
// widget formatee montos igual que en las consultas armadas.
const TIPOS_COLUMNAS_BASICO = {
  facturacion: 'moneda', monto: 'moneda', reservas: 'numero',
  cantidad: 'numero', pasajeros: 'numero',
};

/** ¿El usuario tiene el permiso que pide la intención? */
const puedeConsultar = (req, intentDef) =>
  req.permisos instanceof Set && req.permisos.has(intentDef.permiso);

const PARAMS_BASICO = ['limit', 'time_range', 'days', 'months', 'month', 'year', 'orderBy', 'dias_inactivos'];

/**
 * Valida el historial que manda el widget para entender preguntas de
 * seguimiento. Viene del cliente, así que se trata como no confiable: cada
 * consulta armada se vuelve a validar con los permisos del usuario, y el
 * historial solo se usa como contexto para la IA, nunca para decidir permisos
 * ni tenant.
 */
function sanitizarHistorial(raw, permisos) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_HISTORIAL)
    .filter((h) => h && typeof h.pregunta === 'string')
    .map((h) => {
      const pregunta = h.pregunta.trim().slice(0, 300);
      if (h.consulta) {
        const consulta = validarConsulta(h.consulta, permisos);
        return consulta ? { pregunta, consulta } : null;
      }
      if (intentCatalog[h.intent] && h.params && typeof h.params === 'object' && !Array.isArray(h.params)) {
        const params = Object.fromEntries(
          Object.entries(h.params)
            .filter(([k, v]) => PARAMS_BASICO.includes(k) && ['string', 'number'].includes(typeof v))
            .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 30) : v])
        );
        return { pregunta, intent: h.intent, params };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Redacta la respuesta con Gemini si está disponible; si no, el resumen que
 * arma el sistema.
 */
async function redactarRespuesta({ query, descripcion, resultado }) {
  if (gemini.disponible()) {
    try {
      const texto = await asistenteIA.redactar({ pregunta: query, descripcion, resultado });
      if (texto) return { summary: texto, origen: 'ia' };
    } catch (error) {
      console.warn('[asistente] Gemini no pudo redactar, se usa el resumen del sistema:', error.message);
    }
  }
  return { summary: resultado.summary, origen: 'local' };
}

function registrarConsulta(datos) {
  if (process.env.NODE_ENV === 'test') return;
  console.log(JSON.stringify({ type: 'assistant_query', timestamp: new Date().toISOString(), ...datos }));
}

/**
 * Modo IA: Gemini arma la consulta con las piezas del catálogo, el servidor la
 * valida y la ejecuta, y Gemini redacta la respuesta.
 *
 * @returns {Promise<object|null>} la respuesta, o null para pasar al modo
 *          básico (Gemini no disponible, falló, dijo que no se puede o armó
 *          algo inválido).
 */
async function responderConIA(req, query, historial) {
  if (!gemini.disponible()) return null;

  let consulta;
  try {
    consulta = await asistenteIA.interpretarConsulta(query, historial, req.permisos);
  } catch (error) {
    console.warn('[asistente] Gemini no pudo interpretar, se usa el modo básico:', error.message);
    return null;
  }
  // "No se puede" o consulta inválida: se le da la chance al clasificador
  // local, que puede reconocer algo o dar un aviso de permisos claro.
  if (!consulta || consulta.ninguna) return null;

  // mayorista_id desde el middleware, NUNCA de la IA ni del body
  const resultado = await ejecutarConsulta(consulta, req.mayorista_id);

  if (resultado.aviso) {
    return {
      success: true,
      intent: 'consulta_armada',
      consulta,
      visualization: null,
      data: [],
      summary: resultado.aviso,
      origen: { interpretacion: 'ia', redaccion: 'local' },
    };
  }

  const redaccion = await redactarRespuesta({ query, descripcion: resultado.descripcion, resultado });

  registrarConsulta({
    mayorista_id: req.mayorista_id,
    query_original: query,
    consulta,
    origen_interpretacion: 'ia',
    origen_redaccion: redaccion.origen,
    results_count: resultado.data?.length ?? 0,
  });

  return {
    success: true,
    intent: 'consulta_armada',
    consulta,
    description: resultado.descripcion,
    visualization: resultado.visualization,
    data: resultado.data,
    summary: redaccion.summary,
    stat: resultado.stat || null,
    columns: resultado.columns || [],
    columnLabels: resultado.columnLabels || {},
    columnTypes: resultado.columnTypes || {},
    origen: { interpretacion: 'ia', redaccion: redaccion.origen },
  };
}

/**
 * Modo básico: clasificador determinístico sobre las 6 consultas fijas. Es el
 * comportamiento original del asistente y el respaldo cuando la IA no está.
 */
async function responderModoBasico(req, query) {
  const classification = classify(query, { rol: req.usuario?.rol });

  if (classification.intent === 'unknown') {
    return {
      success: true,
      intent: 'unknown',
      confidence: classification.confidence,
      message: 'No pude entender tu consulta. Podés preguntarme sobre:',
      // Solo se sugiere lo que el usuario puede consultar
      suggestions: Object.entries(intentCatalog)
        .filter(([, def]) => def.roles.includes(req.usuario?.rol) && puedeConsultar(req, def))
        .map(([nombre, def]) => ({ intent: nombre, example: def.example })),
      origen: { interpretacion: 'local', redaccion: null },
    };
  }

  const intentDef = intentCatalog[classification.intent];
  if (!intentDef || !intentDef.roles.includes(req.usuario?.rol)) {
    return { status: 403, body: { success: false, message: 'No tenés permisos para ejecutar esta consulta.' } };
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
    return {
      status: 403,
      body: {
        success: false,
        code: 'ASSISTANT_INTENT_FORBIDDEN',
        message: `Tu rol no incluye acceso a esta consulta (${intentDef.description.toLowerCase()}). `
          + 'Si la necesitás, pedíselo al administrador de tu empresa.',
      },
    };
  }

  // mayorista_id desde el middleware, NUNCA del body
  const result = await execute(classification.intent, classification.params, req.mayorista_id);

  const descripcion = classification.params.time_range
    ? `${intentDef.description} ${describirPeriodo(classification.params)}`
    : intentDef.description;
  const redaccion = await redactarRespuesta({ query, descripcion, resultado: result });

  registrarConsulta({
    mayorista_id: req.mayorista_id,
    query_original: query,
    intent_clasificado: classification.intent,
    confidence: classification.confidence,
    matched_keywords: classification.matched_keywords,
    params: classification.params,
    origen_interpretacion: 'local',
    origen_redaccion: redaccion.origen,
    results_count: result.data?.length ?? 0,
  });

  return {
    success: true,
    intent: classification.intent,
    confidence: classification.confidence,
    description: classification.description,
    visualization: intentDef.visualization,
    params: classification.params,
    data: result.data,
    summary: redaccion.summary,
    stat: result.stat || null,
    columns: result.columns || [],
    columnLabels: result.columnLabels || {},
    columnTypes: Object.fromEntries((result.columns || []).map((col) => [col, TIPOS_COLUMNAS_BASICO[col] || 'texto'])),
    metadata: result.metadata,
    origen: { interpretacion: 'local', redaccion: redaccion.origen },
  };
}

/**
 * @desc    Estado de la IA del asistente (para el indicador del widget)
 * @route   GET /api/v1/assistant/estado
 * @access  Private/Mayorista
 */
exports.estado = (_req, res) => {
  res.json({ success: true, ia: gemini.estado() });
};

/**
 * @desc    Procesar una consulta del Asistente Inteligente
 * @route   POST /api/v1/assistant/query
 * @access  Private/Mayorista
 *
 * Primero intenta el modo IA (consultas armadas por Gemini); si no está
 * disponible o no puede, el modo básico (clasificador + 6 consultas fijas).
 */
exports.query = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const rawQuery = req.body?.query;
    if (!rawQuery || typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'La consulta no puede estar vacía.' });
    }

    // Sanitizar: trim + limitar largo + strip HTML básico
    const query = rawQuery.trim().slice(0, 300).replace(/<[^>]*>/g, '');
    const historial = sanitizarHistorial(req.body?.historial, req.permisos);

    let respuesta = null;
    try {
      respuesta = await responderConIA(req, query, historial);
    } catch (error) {
      // Un error ejecutando la consulta armada (por ejemplo, maxTimeMS) no
      // deja al usuario sin respuesta: se intenta el modo básico.
      console.warn('[asistente] Falló la consulta armada, se usa el modo básico:', error.message);
    }
    if (!respuesta) respuesta = await responderModoBasico(req, query);

    if (respuesta.status) return res.status(respuesta.status).json(respuesta.body);

    return res.json({
      ...respuesta,
      ia: gemini.estado(),
      metadata: {
        ...(respuesta.metadata || {}),
        executed_at: new Date().toISOString(),
        query_time_ms: Date.now() - startTime,
      },
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
