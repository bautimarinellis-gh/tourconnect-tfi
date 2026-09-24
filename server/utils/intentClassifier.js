/**
 * Intent Classifier — Clasificador basado en keywords y scoring.
 *
 * Sin dependencias externas. Latencia < 5ms.
 *
 * Algoritmo:
 *  1. Normaliza la query: minúsculas, sin tildes, solo alfanumérico + espacios
 *  2. Para cada intent, calcula un score sumando pesos de keywords presentes
 *     (cada keyword cuenta una sola vez, aunque se repita)
 *  3. Calcula confidence = score / maxScore alcanzable, sin contar palabras
 *     neutras (conectores, expresiones de tiempo, números)
 *  4. Selecciona el intent con mayor confidence
 *  5. Si confidence < THRESHOLD → retorna intent "unknown"
 *  6. Extrae parámetros de la query con regex
 */

const intentCatalog = require('./intentCatalog');
const { MESES, hoyAR } = require('./fechasAR');

// Umbral mínimo de confidence para aceptar un intent.
// 0.20 requiere que las keywords matcheadas representen al menos el 20% del máximo
// alcanzable para esa query — evita matches por una sola keyword débil en queries largas.
const CONFIDENCE_THRESHOLD = 0.20;

// Score bruto mínimo independiente del threshold.
// Previene que una keyword de peso 1 en una query de 2-3 tokens pase solo por ratio.
const MIN_SCORE = 2;

// Palabras que no aportan a la intención: conectores y verbos de relleno
// ("dame", "mostrame") y el vocabulario de tiempo, que es un parámetro y no
// define qué se pregunta. No entran en el denominador de la confidence, así
// una pregunta natural y larga no queda por debajo del umbral solo por tener
// más palabras. Si una de estas palabras es keyword del intent evaluado, sí
// cuenta (por ejemplo "mes" para ingresos_periodo).
const PALABRAS_NEUTRAS = new Set([
  // Conectores y relleno
  'a', 'al', 'con', 'cual', 'cuales', 'como', 'cuanto', 'cuanta', 'de', 'del',
  'el', 'en', 'es', 'esta', 'estan', 'este', 'la', 'las', 'lo', 'los', 'me',
  'mi', 'mis', 'o', 'para', 'por', 'que', 'se', 'son', 'su', 'sus', 'tengo',
  'tiene', 'tuve', 'tuvo', 'un', 'una', 'unos', 'unas', 'y', 'dame', 'decime',
  'mostrame', 'quiero', 'ver', 'saber', 'segun', 'hace',
  // Tiempo
  'hoy', 'ayer', 'dia', 'dias', 'semana', 'semanas', 'mes', 'meses', 'ano',
  'anos', 'anio', 'anios', 'trimestre', 'trimestres', 'ultimo', 'ultima',
  'ultimos', 'ultimas', 'pasado', 'pasada', 'anterior', 'actual', 'corriente',
  'curso', 'periodo', 'historico', 'historica', 'siempre',
  ...MESES,
]);

/**
 * Normaliza un texto para comparación:
 * minúsculas, sin tildes, sin caracteres especiales.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remover tildes
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
 * Retorna { score, confidence, matched } donde matched es el array de keywords encontradas.
 */
function scoreIntent(intentDef, tokens) {
  const unicos = [...new Set(tokens)];
  const matched = unicos.filter((t) => intentDef.keywords[t] !== undefined);
  const score = matched.reduce((s, t) => s + intentDef.keywords[t], 0);

  if (score === 0) return { score: 0, confidence: 0, matched: [] };

  // Tokens que pesan en el denominador: las keywords del intent y todo lo que
  // no sea neutro ni un número.
  const relevantes = unicos.filter((t) => intentDef.keywords[t] !== undefined
    || (!PALABRAS_NEUTRAS.has(t) && !/^\d+$/.test(t)));

  // Peso máximo del catálogo de este intent (generalmente 3)
  const maxKeywordWeight = Math.max(...Object.values(intentDef.keywords));

  // Score máximo teórico del intent completo
  const totalMaxScore = Object.values(intentDef.keywords).reduce((a, b) => a + b, 0);

  // Score máximo alcanzable para ESTA query (cuánto podría haber sumado
  // si cada token relevante matcheara la keyword de mayor peso).
  // Lo cappamos al máximo total del intent para no dividir por menos de lo real.
  const reachableMaxScore = Math.min(totalMaxScore, relevantes.length * maxKeywordWeight);

  // Confidence relativa a lo que la query puede razonablemente lograr.
  const confidence = reachableMaxScore > 0 ? score / reachableMaxScore : 0;

  return { score, confidence, matched };
}

const UNIDAD_TIEMPO = /^ (dias?|semanas?|mes(es)?|anos?|anios?)\b/;

/**
 * Extrae la cantidad pedida ("top 5", "las 10 agencias").
 *
 * No toma cualquier número: descarta los que son parte de una expresión de
 * tiempo ("últimos 3 meses", "hace 2 semanas") y los años ("marzo 2025").
 * Si hay "top N", gana ese.
 */
function extraerCantidad(normalized) {
  const top = normalized.match(/\btop (\d+)\b/);
  if (top) return parseInt(top[1], 10);

  for (const m of normalized.matchAll(/\b(\d+)\b/g)) {
    const resto = normalized.slice(m.index + m[0].length);
    const previo = normalized.slice(0, m.index);
    if (UNIDAD_TIEMPO.test(resto)) continue;
    if (/\bhace $/.test(previo)) continue;
    if (/^(19|20)\d{2}$/.test(m[1])) continue;
    return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Convierte "N días/semanas/meses/años" en { dias } o { meses }.
 */
function duracion(n, unidad) {
  if (unidad.startsWith('dia')) return { dias: n };
  if (unidad.startsWith('semana')) return { dias: n * 7 };
  if (unidad.startsWith('mes')) return { meses: n };
  return { meses: n * 12 }; // años
}

/**
 * Extrae el período de la query. Devuelve los params de tiempo a mezclar con
 * los defaults, o null si no reconoce ninguna expresión (queda el default).
 *
 * El orden importa: las expresiones específicas ("la semana pasada") van
 * antes que las genéricas ("semana"). Todas las regex delimitan palabras para
 * que, por ejemplo, "días" o "mediados" no se lean como "hoy".
 */
function extraerPeriodo(normalized, now) {
  if (/\bayer\b/.test(normalized)) return { time_range: 'yesterday' };
  if (/\bhoy\b/.test(normalized)) return { time_range: 'today' };

  // "últimos 15 días", "últimas 2 semanas", "últimos 3 meses", "último año"
  const ultimos = normalized.match(/\bultim[oa]s? (\d+) (dias?|semanas?|mes(?:es)?|anos?|anios?)\b/);
  if (ultimos) {
    const d = duracion(parseInt(ultimos[1], 10), ultimos[2]);
    if (d.dias && d.dias >= 1 && d.dias <= 730) return { time_range: 'last_n_days', days: d.dias };
    if (d.meses && d.meses >= 1 && d.meses <= 60) return { time_range: 'last_n_months', months: d.meses };
  }
  const ultimosPalabra = normalized.match(/\bultim[oa]s (tres|seis) meses\b/);
  if (ultimosPalabra) {
    return { time_range: 'last_n_months', months: ultimosPalabra[1] === 'tres' ? 3 : 6 };
  }

  if (/\bsemana (pasada|anterior)\b/.test(normalized)) return { time_range: 'last_week' };
  if (/\bmes (pasado|anterior)\b/.test(normalized)) return { time_range: 'last_month' };
  if (/\btrimestre (pasado|anterior)\b/.test(normalized)) return { time_range: 'last_quarter' };
  if (/\b(ano|anio) (pasado|anterior)\b/.test(normalized)) return { time_range: 'last_year' };

  // "el último mes" / "la última semana" = ventana móvil, no el mes calendario
  if (/\bultimo mes\b/.test(normalized)) return { time_range: 'last_n_days', days: 30 };
  if (/\bultima semana\b/.test(normalized)) return { time_range: 'last_n_days', days: 7 };
  if (/\bultimo (ano|anio)\b/.test(normalized)) return { time_range: 'last_n_months', months: 12 };

  // "del mes" / "del año" sin más = el período en curso. Se excluyen "del mes
  // de marzo" y "del año 2025", que nombran otro período.
  if (/\beste mes\b|\bmes (actual|corriente|en curso)\b|\bdel mes\b(?! de)/.test(normalized)) return { time_range: 'current_month' };
  if (/\beste trimestre\b|\btrimestre (actual|en curso)\b/.test(normalized)) return { time_range: 'current_quarter' };
  if (/\beste (ano|anio)\b|\b(ano|anio) (actual|en curso)\b|\bdel (ano|anio)\b(?! (19|20)\d{2})/.test(normalized)) return { time_range: 'current_year' };
  if (/\bsemana\b/.test(normalized)) return { time_range: 'last_n_days', days: 7 };

  // Mes específico: "de mayo", "en enero 2024", "del mes de marzo"
  const mes = normalized.match(new RegExp(`\\b(${MESES.join('|')})\\b`));
  if (mes) {
    const month = MESES.indexOf(mes[1]) + 1;
    const anioExplicito = normalized.match(/\b((19|20)\d{2})\b/);
    let year;
    if (anioExplicito) {
      year = parseInt(anioExplicito[1], 10);
    } else {
      // Sin año: el último mes con ese nombre que ya empezó. "Diciembre"
      // preguntado en septiembre es diciembre del año pasado, no uno futuro.
      const hoy = hoyAR(now);
      year = month - 1 > hoy.m ? hoy.y - 1 : hoy.y;
    }
    return { time_range: 'specific_month', month, year };
  }

  if (/\bde siempre\b|\bhistoric[oa]\b|\btodo el (tiempo|historial|periodo)\b|\bdesde (el )?(inicio|principio|comienzo)\b|\bsin filtro\b/.test(normalized)) {
    return { time_range: 'all_time' };
  }

  return null;
}

/**
 * Extrae parámetros de la query usando regex.
 */
function extractParams(query, intentName, defaultParams, now) {
  const normalized = normalize(query);
  const params = { ...defaultParams };

  // Extraer límite numérico (ej: "top 5", "las 10 agencias")
  if ('limit' in params) {
    const num = extraerCantidad(normalized);
    if (num !== null && num >= 1 && num <= 100) {
      params.limit = num;
    }
  }

  // Extraer rango de tiempo (si no reconoce ninguno, queda el default)
  if ('time_range' in params) {
    Object.assign(params, extraerPeriodo(normalized, now));
  }

  // Extraer orderBy para top_agencias
  if (intentName === 'top_agencias' && 'orderBy' in params) {
    if (/factur|monto|dinero|ganancia|plata|cobrado/.test(normalized)) {
      params.orderBy = 'facturacion';
    } else {
      params.orderBy = 'reservas';
    }
  }

  // Extraer días de inactividad para agencias_inactivas ("30 días", "2 meses")
  if (intentName === 'agencias_inactivas' && 'dias_inactivos' in params) {
    const m = normalized.match(/\b(\d+) (dias?|semanas?|mes(?:es)?)\b/);
    if (m) {
      const d = duracion(parseInt(m[1], 10), m[2]);
      const dias = d.dias ?? d.meses * 30;
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
 * @param {object} context - { rol, now? } (now permite fijar la fecha de referencia)
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

    if (
      confidence > bestConfidence ||
      (confidence === bestConfidence && score > bestScore) ||
      (confidence === bestConfidence && score === bestScore && matched.length > bestMatched.length)
    ) {
      bestIntent = intentName;
      bestScore = score;
      bestConfidence = confidence;
      bestMatched = matched;
    }
  }

  // Si no supera el umbral mínimo o el score bruto es insuficiente, retornar unknown
  if (bestConfidence < CONFIDENCE_THRESHOLD || bestScore < MIN_SCORE) {
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

  const params = extractParams(query, bestIntent, intentCatalog[bestIntent].defaultParams, context.now);

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
