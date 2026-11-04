const crypto = require('crypto');

/**
 * Cliente mínimo de la API de Mercado Pago (Checkout Pro).
 *
 * Se habla con la API REST por fetch en vez de sumar el SDK: son tres
 * llamadas (crear preferencia, leer un pago, buscar pagos de una reserva) y
 * así los tests pueden reemplazar `fetch` sin mockear una librería entera.
 *
 * El dinero NO es real: solo se aceptan credenciales de prueba. Con un token
 * `TEST-...` o el de un usuario de prueba de MP (tag `test_user`), los pagos se
 * hacen con tarjetas de prueba. Con credenciales productivas de una cuenta
 * real el servicio se niega a operar (ver verificarCredencialesDePrueba), salvo
 * que se habilite a propósito con MP_PERMITIR_PRODUCCION=true.
 */

const API_URL = 'https://api.mercadopago.com';

/**
 * Credenciales con las que se cobra una reserva.
 *
 * Hoy todo se cobra con una única cuenta de prueba (la de la plataforma). En
 * producción cada mayorista vincularía su propia cuenta de MP (OAuth), y este
 * es el único lugar que habría que cambiar: recibe el mayorista dueño de la
 * reserva justamente para eso.
 */
const credencialesPara = (_mayoristaId) => ({
  accessToken: process.env.MP_ACCESS_TOKEN || null,
});

const estaConfigurado = () => Boolean(process.env.MP_ACCESS_TOKEN && tipoDeCambio());

/** Pesos por dólar con los que se convierte el precio (USD) a lo que cobra MP (ARS). */
const tipoDeCambio = () => {
  const valor = parseFloat(process.env.MP_TIPO_CAMBIO_ARS);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
};

/** Monto en pesos con dos decimales, que es lo que acepta MP. */
const convertirAPesos = (montoUsd, cambio = tipoDeCambio()) =>
  Math.round(montoUsd * cambio * 100) / 100;

class MercadoPagoError extends Error {
  constructor(message, { status = 502, detalle = null, httpStatus = null, codigo = null } = {}) {
    super(message);
    this.name = 'MercadoPagoError';
    this.statusCode = status;
    this.detalle = detalle;
    // Lo que respondió MP (status HTTP y cause[0].code), para distinguir errores puntuales.
    this.httpStatus = httpStatus;
    this.codigo = codigo;
  }
}

const llamar = async (ruta, { metodo = 'GET', cuerpo, accessToken, idempotencia } = {}) => {
  if (!accessToken) {
    throw new MercadoPagoError('Mercado Pago no está configurado en el servidor', { status: 503 });
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (idempotencia) headers['X-Idempotency-Key'] = idempotencia;

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new MercadoPagoError('No se pudo conectar con Mercado Pago', { detalle: error.message });
  }

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new MercadoPagoError('Mercado Pago rechazó la operación', {
      status: respuesta.status === 404 ? 404 : 502,
      detalle: datos?.message || `HTTP ${respuesta.status}`,
      httpStatus: respuesta.status,
      codigo: datos?.cause?.[0]?.code ?? null,
    });
  }
  return datos;
};

// Resultado cacheado por token: /users/me se consulta una sola vez.
const verificacionPorToken = new Map();

/**
 * Garantiza que el token sea de prueba antes de cobrar nada.
 *
 * `TEST-...` son las credenciales de prueba de la aplicación. Los usuarios de
 * prueba de MP usan tokens `APP_USR-...` que se ven igual que los reales, así
 * que en ese caso se pregunta a la API: la cuenta trae el tag `test_user`.
 */
const esCuentaDePrueba = async (accessToken) => {
  if (accessToken.startsWith('TEST-')) return true;

  if (!verificacionPorToken.has(accessToken)) {
    verificacionPorToken.set(
      accessToken,
      llamar('/users/me', { accessToken })
        .then((cuenta) => Array.isArray(cuenta?.tags) && cuenta.tags.includes('test_user'))
        .catch((error) => {
          verificacionPorToken.delete(accessToken);
          throw error;
        })
    );
  }
  return verificacionPorToken.get(accessToken);
};

const verificarCredencialesDePrueba = async (accessToken) => {
  if (process.env.MP_PERMITIR_PRODUCCION === 'true') return;

  if (!(await esCuentaDePrueba(accessToken))) {
    throw new MercadoPagoError(
      'Las credenciales de Mercado Pago no son de prueba. TourConnect solo opera con pagos simulados.',
      { status: 503 }
    );
  }
};

/** Con credenciales TEST- el checkout es el de sandbox; con un usuario de prueba, el normal. */
const urlDeCheckout = (preferencia, accessToken) =>
  accessToken.startsWith('TEST-')
    ? preferencia.sandbox_init_point || preferencia.init_point
    : preferencia.init_point;

/**
 * Crea la preferencia de Checkout Pro de una reserva.
 *
 * - `external_reference` es el id de la reserva: es lo que permite saber a qué
 *   reserva corresponde un pago cuando vuelve por webhook o por la URL.
 * - Las back_urls vuelven al detalle de la reserva en el front, que llama a
 *   /verificar con el payment_id. Con eso alcanza para desarrollo local, sin
 *   URL pública.
 * - auto_return solo con https: MP lo rechaza con back_urls a localhost. Sin
 *   él, el usuario vuelve con el botón "Volver al sitio" del checkout.
 * - notification_url (webhook) solo si hay una URL pública configurada.
 */
const crearPreferencia = async ({ reservaId, mayoristaId, titulo, montoArs, emailPagador }) => {
  const { accessToken } = credencialesPara(mayoristaId);
  if (!accessToken) {
    throw new MercadoPagoError('Mercado Pago no está configurado en el servidor', { status: 503 });
  }
  await verificarCredencialesDePrueba(accessToken);

  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const urlRetorno = `${clientUrl}/agencia/reservas/${reservaId}`;

  const cuerpo = {
    items: [
      {
        id: String(reservaId),
        title: titulo.slice(0, 250),
        quantity: 1,
        currency_id: 'ARS',
        unit_price: montoArs,
      },
    ],
    external_reference: String(reservaId),
    metadata: { reserva_id: String(reservaId) },
    back_urls: { success: urlRetorno, failure: urlRetorno, pending: urlRetorno },
    statement_descriptor: 'TOURCONNECT',
  };
  if (emailPagador) cuerpo.payer = { email: emailPagador };
  if (clientUrl.startsWith('https://')) cuerpo.auto_return = 'approved';
  if (process.env.MP_WEBHOOK_URL) cuerpo.notification_url = process.env.MP_WEBHOOK_URL;

  const preferencia = await llamar('/checkout/preferences', {
    metodo: 'POST',
    cuerpo,
    accessToken,
    idempotencia: crypto.randomUUID(),
  });

  return {
    preference_id: preferencia.id,
    url_checkout: urlDeCheckout(preferencia, accessToken),
  };
};

/** Lee un pago por su id. Es la única fuente confiable de su estado. */
const obtenerPago = async (paymentId, mayoristaId) => {
  const { accessToken } = credencialesPara(mayoristaId);
  return llamar(`/v1/payments/${encodeURIComponent(paymentId)}`, { accessToken });
};

/** Pago más reciente de una reserva (por external_reference), o null. */
const buscarUltimoPagoDeReserva = async (reservaId, mayoristaId) => {
  const { accessToken } = credencialesPara(mayoristaId);
  const params = new URLSearchParams({
    external_reference: String(reservaId),
    sort: 'date_created',
    criteria: 'desc',
    limit: '1',
  });
  const datos = await llamar(`/v1/payments/search?${params}`, { accessToken });
  return datos?.results?.[0] ?? null;
};

/**
 * El sandbox de MP no deja reembolsar ni anular por API los pagos de un
 * usuario de prueba: responde 401 "Unauthorized use of live credentials"
 * (cause code 7). Solo en ese caso, y solo si la cuenta está verificada como
 * de prueba, la operación se registra como SIMULADA (`simulado: true`), para
 * que el circuito de cancelación se pueda demostrar. Con credenciales reales
 * ese error nunca se simula: sube y la reserva no se cancela.
 */
const MOTIVO_SIMULACION = 'el sandbox de Mercado Pago no permite reembolsos ni anulaciones por API con cuentas de prueba';

const esBloqueoDelSandbox = (error) =>
  error instanceof MercadoPagoError && error.httpStatus === 401 && error.codigo === 7;

const conSimulacionEnPrueba = async (accessToken, operacion, simulado) => {
  try {
    return await operacion();
  } catch (error) {
    if (esBloqueoDelSandbox(error) && (await esCuentaDePrueba(accessToken))) {
      return { ...simulado, simulado: true };
    }
    throw error;
  }
};

/**
 * Reembolsa el total de un pago aprobado.
 *
 * La clave de idempotencia es fija por pago: si la cancelación falla después
 * de reembolsar y se reintenta, MP responde con el mismo reembolso en vez de
 * hacer otro.
 */
const reembolsarPago = async (paymentId, mayoristaId) => {
  const { accessToken } = credencialesPara(mayoristaId);
  return conSimulacionEnPrueba(
    accessToken,
    () => llamar(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
      metodo: 'POST',
      cuerpo: {},
      accessToken,
      idempotencia: `tourconnect-reembolso-${paymentId}`,
    }),
    { id: null, status: 'approved' }
  );
};

/** Anula un pago que todavía no se acreditó (por ejemplo, un cupón de Rapipago sin pagar). */
const anularPago = async (paymentId, mayoristaId) => {
  const { accessToken } = credencialesPara(mayoristaId);
  return conSimulacionEnPrueba(
    accessToken,
    () => llamar(`/v1/payments/${encodeURIComponent(paymentId)}`, {
      metodo: 'PUT',
      cuerpo: { status: 'cancelled' },
      accessToken,
      idempotencia: `tourconnect-anulacion-${paymentId}`,
    }),
    { status: 'cancelled' }
  );
};

/**
 * Valida el header x-signature de un webhook de MP.
 *
 * MP firma con HMAC-SHA256 (clave secreta del panel de "Webhooks") el texto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Si el data.id es
 * alfanumérico, va en minúsculas.
 */
const validarFirmaWebhook = ({ xSignature, xRequestId, dataId, secreto }) => {
  if (!xSignature || !secreto) return false;

  const partes = Object.fromEntries(
    xSignature.split(',').map((p) => p.split('=').map((s) => s.trim()))
  );
  const { ts, v1 } = partes;
  if (!ts || !v1) return false;

  let manifiesto = '';
  if (dataId) manifiesto += `id:${String(dataId).toLowerCase()};`;
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${ts};`;

  const esperado = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  estaConfigurado,
  tipoDeCambio,
  convertirAPesos,
  crearPreferencia,
  obtenerPago,
  buscarUltimoPagoDeReserva,
  reembolsarPago,
  anularPago,
  MOTIVO_SIMULACION,
  validarFirmaWebhook,
  MercadoPagoError,
};
