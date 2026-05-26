/**
 * Intent Classifier — Clasificador basado en keywords y scoring.
 *
 * Sin dependencias externas. Latencia < 5ms.
 *
 * Algoritmo:
 *  1. Normaliza la query: minúsculas, sin tildes, solo alfanumérico + espacios
 *  2. Para cada intent, calcula un score sumando pesos de keywords presentes
 *  3. Calcula confidence = score / maxScore posible del intent
 *  4. Selecciona el intent con mayor confidence
 *  5. Si confidence < THRESHOLD → retorna intent "unknown"
 *  6. Extrae parámetros de la query con regex
 */

const intentCatalog = require('./intentCatalog');

// Umbral mínimo de confidence para aceptar un intent.
// Con la fórmula basada en tokens, un match de 2 keywords de peso 3
// sobre una query de 4 tokens da: 6/(4*3) = 0.5 — muy por encima.
const CONFIDENCE_THRESHOLD = 0.08;

/**
 * Normaliza un texto para comparación:
 * minúsculas, sin tildes, sin caracteres especiales.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remover tildes
    .replace(/[^a-z0-9\s]/g, ' ')   // solo alfanumérico
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokeniza el texto normalizado en palabras individuales.
 */
function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

/**
 * Calcula el score de un intent para una lista de tokens.
 * Retorna { score, matched } donde matched es el array de keywords encontradas.
 */
function scoreIntent(intentDef, tokens) {
  const matched = [];
  let score = 0;

  for (const token of tokens) {
    if (intentDef.keywords[token] !== undefined) {
      score += intentDef.keywords[token];
      // No duplicar si el mismo token aparece varias veces
      if (!matched.includes(token)) matched.push(token);
    }
  }

  if (score === 0) return { score: 0, confidence: 0, matched: [] };

  // Peso máximo del catálogo de este intent (generalmente 3)
  const maxKeywordWeight = Math.max(...Object.values(intentDef.keywords));

  // Score máximo teórico del intent completo
  const totalMaxScore = Object.values(intentDef.keywords).reduce((a, b) => a + b, 0);

  // Score máximo alcanzable para ESTA query (cuánto podría haber sumado
  // si cada token matcheara la keyword de mayor peso).
  // Lo cappamos al máximo total del intent para no dividir por menos de lo real.
  const reachableMaxScore = Math.min(totalMaxScore, tokens.length * maxKeywordWeight);

  // Confidence relativa a lo que la query puede razonablemente lograr.
  const confidence = reachableMaxScore > 0 ? score / reachableMaxScore : 0;

  return { score, confidence, matched };
}

/**
 * Extrae parámetros de la query usando regex.
 */
function extractParams(query, intentName, defaultParams) {
  const normalized = normalize(query);
  const params = { ...defaultParams };

  // Extraer límite numérico (ej: "top 5", "las 10 agencias")
  const limitMatch = normalized.match(/\b(\d+)\b/);
  if (limitMatch && 'limit' in params) {
    const num = parseInt(limitMatch[1], 10);
    if (num >= 1 && num <= 100) {
      params.limit = num;
    }
  }

  // Extraer rango de tiempo
  if ('time_range' in params) {
    if (/hoy|dia|dias?\s+de\s+hoy/.test(normalized)) {
      params.time_range = 'today';
    } else if (/esta\s+semana|ultimos?\s+7\s+dias?|semana/.test(normalized)) {
      params.time_range = 'last_7_days';
    } else if (/este\s+mes|mes\s+actual|mes\s+corriente/.test(normalized)) {
      params.time_range = 'current_month';
    } else if (/ultimos?\s+3\s+meses?|tres\s+meses?/.test(normalized)) {
      params.time_range = 'last_90_days';
    } else if (/ultimos?\s+6\s+meses?|seis\s+meses?/.test(normalized)) {
      params.time_range = 'last_6_months';
    } else if (/este\s+ano|ano\s+actual|anio\s+actual/.test(normalized)) {
      params.time_range = 'current_year';
    }
    // Default: last_30_days (ya seteado en defaultParams)
  }

  // Extraer orderBy para top_agencias
  if (intentName === 'top_agencias' && 'orderBy' in params) {
    if (/facturac|monto|dinero|ganancia|plata|cobrado/.test(normalized)) {
      params.orderBy = 'facturacion';
    } else {
      params.orderBy = 'reservas';
    }
  }

  // Extraer días de inactividad para agencias_inactivas
  if (intentName === 'agencias_inactivas' && 'dias_inactivos' in params) {
    const diasMatch = normalized.match(/(\d+)\s*dias?/);
    if (diasMatch) {
      const dias = parseInt(diasMatch[1], 10);
      if (dias >= 1 && dias <= 365) {
        params.dias_inactivos = dias;
      }
    }
  }

  return params;
}

/**
 * Clasifica una query y retorna el intent + params + confidence.
 *
 * @param {string} query - Consulta en lenguaje natural del usuario
 * @param {object} context - { rol, mayorista_id }
 * @returns {{ intent, params, confidence, description, matched_keywords }}
 */
function classify(query, context = {}) {
  if (!query || typeof query !== 'string') {
    return { intent: 'unknown', confidence: 0, params: {} };
  }

  const tokens = tokenize(query);

  if (tokens.length === 0) {
    return { intent: 'unknown', confidence: 0, params: {} };
  }

  let bestIntent = null;
  let bestScore = -1;
  let bestConfidence = 0;
  let bestMatched = [];

  for (const [intentName, intentDef] of Object.entries(intentCatalog)) {
    // Verificar permisos del rol
    if (context.rol && !intentDef.roles.includes(context.rol)) {
      continue;
    }

    const { score, confidence, matched } = scoreIntent(intentDef, tokens);

    if (confidence > bestConfidence || (confidence === bestConfidence && score > bestScore)) {
      bestIntent = intentName;
      bestScore = score;
      bestConfidence = confidence;
      bestMatched = matched;
    }
  }

  // Si no supera el umbral mínimo, retornar unknown
  if (bestConfidence < CONFIDENCE_THRESHOLD || bestScore === 0) {
    return {
      intent: 'unknown',
      confidence: bestConfidence,
      params: {},
      matched_keywords: [],
      suggestions: Object.entries(intentCatalog)
        .filter(([, def]) => !context.rol || def.roles.includes(context.rol))
        .map(([name, def]) => ({ intent: name, example: def.example })),
    };
  }

  const params = extractParams(query, bestIntent, intentCatalog[bestIntent].defaultParams);

  return {
    intent: bestIntent,
    confidence: Math.round(bestConfidence * 100) / 100,
    params,
    description: intentCatalog[bestIntent].description,
    visualization: intentCatalog[bestIntent].visualization,
    matched_keywords: bestMatched,
  };
}

module.exports = { classify };
