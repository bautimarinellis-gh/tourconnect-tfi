const path = require('path');
const dotenv = require('dotenv');

/**
 * Carga y valida las variables de entorno.
 *
 * El .env está en la raíz del repo. La ruta se arma desde este archivo y no
 * desde el directorio de trabajo: con '../.env', correr el server desde otra
 * carpeta leía otro archivo (o ninguno) sin avisar.
 *
 * Las obligatorias cortan el arranque con un mensaje claro: sin JWT_SECRET el
 * server levantaba igual y fallaba recién en el primer login con un 500.
 */
const RUTA_ENV = path.resolve(__dirname, '..', '..', '.env');

const OBLIGATORIAS = ['MONGO_URI', 'JWT_SECRET'];

const cargarEnv = () => {
  dotenv.config({ path: RUTA_ENV });

  const faltantes = OBLIGATORIAS.filter((nombre) => !process.env[nombre]);
  if (faltantes.length > 0) {
    console.error(`❌ Faltan variables de entorno obligatorias: ${faltantes.join(', ')} (ver .env.example)`);
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️ JWT_SECRET tiene menos de 32 caracteres: usá uno más largo en producción.');
  }

  // Avisos de funciones que quedan apagadas por configuración: mejor saberlo
  // al arrancar que descubrirlo cuando un mail "enviado" no llega.
  if (process.env.ENABLE_EMAIL !== 'true') {
    console.warn('⚠️ ENABLE_EMAIL no está en "true": no se envían mails (invitaciones, recuperación de clave, avisos).');
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY no configurada: el asistente responde solo en modo básico.');
  }
  if (!process.env.MP_ACCESS_TOKEN) {
    console.warn('⚠️ MP_ACCESS_TOKEN no configurado: el pago con Mercado Pago queda deshabilitado.');
  } else if (!process.env.MP_WEBHOOK_SECRET) {
    console.warn('⚠️ MP_WEBHOOK_SECRET no configurado: el webhook de Mercado Pago no valida la firma.');
  }
};

module.exports = { cargarEnv, RUTA_ENV };
