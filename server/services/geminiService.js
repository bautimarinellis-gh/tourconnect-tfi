/**
 * Servicio de Gemini para el Asistente Inteligente.
 *
 * Es una capa OPCIONAL: el asistente funciona completo sin ella, con el
 * clasificador determinístico y los resúmenes armados por el sistema. Si no hay
 * API key, si se agota la cuota gratuita o si Gemini falla o tarda, el
 * controller cae al modo básico y el usuario igual recibe su respuesta.
 *
 * La key vive solo en el servidor (GEMINI_API_KEY en el .env) y nunca viaja al
 * frontend.
 *
 * Disyuntor: después de un error no se reintenta en cada pregunta (cada intento
 * fallido le costaría al usuario la espera del timeout). Se pausa la IA un
 * tiempo según el error, y mientras tanto el asistente responde en modo básico.
 */

const { GoogleGenAI } = require('@google/genai');

const MODELO_DEFAULT = 'gemini-3.5-flash-lite';
const TIMEOUT_DEFAULT_MS = 10000;

// Pausas del disyuntor según el tipo de error
const PAUSA_LIMITE_POR_MINUTO_MS = 60 * 1000;
const PAUSA_KEY_INVALIDA_MS = 10 * 60 * 1000;
const PAUSA_ERROR_TEMPORAL_MS = 60 * 1000;

const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
const modelo = process.env.GEMINI_MODEL?.trim() || MODELO_DEFAULT;
const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS) || TIMEOUT_DEFAULT_MS;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Estado del disyuntor (en memoria: se reinicia con el servidor)
const disyuntor = {
  pausadoHasta: 0,
  motivo: null,   // 'sin_cuota' | 'key_invalida' | 'error'
  detalle: null,
};

/**
 * Milisegundos que faltan para la próxima medianoche de la hora del Pacífico,
 * que es cuando Google reinicia la cuota diaria. Se calcula con Intl para
 * respetar el horario de verano de California.
 */
function msHastaReinicioCuota(now = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, Number(p.value)])
  );
  const transcurrido = ((partes.hour * 60 + partes.minute) * 60 + partes.second) * 1000;
  return 24 * 60 * 60 * 1000 - transcurrido;
}

/** Hora argentina (HH:MM) de un instante, para los mensajes al usuario. */
function horaAR(ms) {
  return new Date(ms).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit',
  });
}

/** Pausa la IA según el error recibido. */
function registrarFallo(error) {
  const status = error?.status ?? error?.statusCode;
  // El SDK deja el detalle del error de Google en `body` (por ejemplo
  // "API_KEY_INVALID" o el quotaId "...PerDay..." de un 429), no en el mensaje.
  const mensaje = `${error?.message || ''} ${typeof error?.body === 'string' ? error.body : ''}`;

  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(mensaje)) {
    // La cuota diaria y el límite por minuto devuelven el mismo 429. Si el
    // mensaje habla de "día", se espera al reinicio; si no, un minuto.
    const esDiaria = /per ?day|daily/i.test(mensaje);
    disyuntor.motivo = 'sin_cuota';
    disyuntor.pausadoHasta = Date.now()
      + (esDiaria ? msHastaReinicioCuota() : PAUSA_LIMITE_POR_MINUTO_MS);
    disyuntor.detalle = esDiaria
      ? `Se agotó la cuota diaria gratuita de Gemini. Se reinicia a las ${horaAR(disyuntor.pausadoHasta)} (hora argentina).`
      : 'Se alcanzó el límite de consultas por minuto de Gemini.';
  } else if ((status === 400 && /API_KEY_INVALID|api key/i.test(mensaje)) || status === 401 || status === 403) {
    disyuntor.motivo = 'key_invalida';
    disyuntor.detalle = 'La API key de Gemini no es válida o no tiene acceso al modelo.';
    disyuntor.pausadoHasta = Date.now() + PAUSA_KEY_INVALIDA_MS;
  } else {
    disyuntor.motivo = 'error';
    disyuntor.detalle = 'Gemini no respondió a tiempo o devolvió un error.';
    disyuntor.pausadoHasta = Date.now() + PAUSA_ERROR_TEMPORAL_MS;
  }
}

/** ¿Se puede intentar usar Gemini ahora mismo? */
function disponible() {
  return Boolean(ai) && Date.now() >= disyuntor.pausadoHasta;
}

/**
 * Estado de la IA para mostrar en el widget.
 * @returns {{ estado: 'activa'|'no_configurada'|'sin_cuota'|'key_invalida'|'error', modelo: string|null, detalle: string|null }}
 */
function estado() {
  if (!ai) {
    return {
      estado: 'no_configurada',
      modelo: null,
      detalle: 'No hay una API key de Gemini configurada: el asistente funciona en modo básico.',
    };
  }
  if (Date.now() < disyuntor.pausadoHasta) {
    return { estado: disyuntor.motivo, modelo, detalle: disyuntor.detalle };
  }
  return { estado: 'activa', modelo, detalle: null };
}

/**
 * Llama a Gemini pidiendo un JSON que cumpla `schema` y lo devuelve parseado.
 * Cualquier error (red, timeout, cuota, JSON inválido) alimenta el disyuntor y
 * se relanza para que el llamador caiga al modo básico.
 */
async function generarJSON({ instrucciones, entrada, schema, maxTokens = 512 }) {
  if (!disponible()) {
    throw new Error('Gemini no está disponible.');
  }

  try {
    const interaction = await ai.interactions.create(
      {
        model: modelo,
        system_instruction: instrucciones,
        input: entrada,
        // Nada de lo que se manda queda guardado del lado de Google como
        // interacción reutilizable (no hay memoria del lado del proveedor).
        store: false,
        response_format: { type: 'text', mime_type: 'application/json', schema },
        generation_config: { max_output_tokens: maxTokens },
      },
      { timeout: timeoutMs, maxRetries: 0 },
    );

    const texto = interaction.output_text?.trim();
    if (!texto) throw new Error('Gemini no devolvió contenido.');

    try {
      return JSON.parse(texto);
    } catch {
      throw new Error('Gemini devolvió una respuesta que no es JSON válido.');
    }
  } catch (error) {
    registrarFallo(error);
    throw error;
  }
}

module.exports = { disponible, estado, generarJSON, msHastaReinicioCuota };
