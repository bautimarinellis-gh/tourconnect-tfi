const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const { cargarEnv } = require('./config/env');

// Cargar y validar variables de entorno (antes de cualquier otro módulo que las lea)
cargarEnv();

const connectDB = require('./config/db');
const { sanitizeInput } = require('./middlewares/sanitizeInput');

// Crear app de Express
const app = express();

// Confía en el primer proxy (Nginx en producción). Sin esto, express-rate-limit
// y auditService.getIp() leen X-Forwarded-For sin validar que venga de un
// proxy conocido: la IP auditada es spoofeable y el rate limit, evadible.
app.set('trust proxy', 1);

// ---------------------
// Middlewares globales
// ---------------------
app.use(helmet());
// gzip de las respuestas: los listados JSON se achican varias veces.
app.use(compression());

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
// Antes de sanitizeInput: MP manda `?data.id=...`, una clave con punto que el
// sanitizador rechazaría. El webhook no arma filtros con lo que recibe.
app.use('/api/v1/webhooks', require('./routes/webhookRoute'));
// Después de parsear body y query: rechaza claves que Mongo leería como
// operadores ($ne, $gt, ...) antes de que lleguen a cualquier controller.
app.use(sanitizeInput);

// Logger HTTP solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ---------------------
// Rutas
// ---------------------
// Ruta de health-check
// Incluye el estado de la base: sin Mongo la API no sirve, así que responde 503.
app.get('/api/v1/health', (_req, res) => {
  const baseConectada = mongoose.connection.readyState === 1;
  res.status(baseConectada ? 200 : 503).json({
    status: baseConectada ? 'ok' : 'degradado',
    base_de_datos: baseConectada ? 'conectada' : 'desconectada',
    tareas_periodicas: estadoTareas,
    timestamp: new Date().toISOString(),
    entorno: process.env.NODE_ENV || 'development',
  });
});

// Módulo 2 — Auth
app.use('/api/v1/auth', require('./routes/authRoute'));

// Módulo 3 — Admin
app.use('/api/v1/admin', require('./routes/adminRoute'));

// Módulo 3 — Mayoristas (self-service)
app.use('/api/v1/mayoristas', require('./routes/mayoristaRoute'));

// Módulo 4 — Agencias
app.use('/api/v1/agencias', require('./routes/agenciaRoute'));

// Módulo 5 — Productos
app.use('/api/v1/productos', require('./routes/productoRoute'));

// Módulo 7 — Cotizaciones
app.use('/api/v1/cotizaciones', require('./routes/cotizacionRoute'));

// Módulo 7 — Reservas (incluye historial y pagos)
app.use('/api/v1/reservas', require('./routes/reservaRoute'));

// Módulo 8 — Reportes
app.use('/api/v1/reportes', require('./routes/reporteRoute'));

// Módulo 9 — Asistente Inteligente
app.use('/api/v1/assistant', require('./routes/assistantRoute'));

// Módulo 10 — Auditoría transversal
app.use('/api/v1/auditoria', require('./routes/auditoriaRoute'));

// Módulo 11 — Seguridad (roles y permisos)
app.use('/api/v1/seguridad', require('./routes/seguridadRoute'));

// ---------------------
// Manejo de ruta no encontrada
// ---------------------
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
  });
});

// ---------------------
// Manejo global de errores
// ---------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('💥 Error:', err.stack);

  // Errores de validación de Mongoose
  if (err.name === 'ValidationError') {
    const mensajes = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: 'Error de validación',
      errors: mensajes,
    });
  }

  // Errores de cast (ObjectId inválido)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Recurso no encontrado con id: ${err.value}`,
    });
  }

  // Errores de clave duplicada
  if (err.code === 11000) {
    const campo = Object.keys(err.keyValue).join(', ');
    return res.status(400).json({
      success: false,
      message: `Valor duplicado para el campo: ${campo}`,
    });
  }

  // Conflicto de escritura entre dos transacciones simultáneas (p. ej. doble
  // clic al confirmar una reserva): la que llegó primero ya se aplicó, la otra
  // se abortó sin cambios. No es un error del servidor.
  if (err.hasErrorLabel?.('TransientTransactionError') || err.code === 112) {
    return res.status(409).json({
      success: false,
      message: 'La operación se cruzó con otra al mismo tiempo. Actualizá la pantalla y revisá el estado.',
    });
  }

  // Error genérico
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ---------------------
// Iniciar servidor
// ---------------------
const PORT = process.env.PORT || 3000;
const { checkCotizacionesVencidas } = require('./utils/cotizacionVencimiento');
const { cancelarReservasVencidas, cerrarReservasFinalizadas } = require('./utils/reservaVencimiento');
const { bootstrapSeguridad } = require('./utils/bootstrapSeguridad');
const { completarTenantReservas } = require('./utils/completarTenantReservas');

const startServer = async () => {
  await connectDB();

  require('./models/Persona');
  require('./models/Mayorista');
  require('./models/Agencia');

  // El catálogo de permisos y el rol Administrador se sincronizan solos en
  // cada arranque: son datos derivados de permisosCatalogo.js, no algo que
  // haya que sembrar a mano. Si falla, el server igual levanta — los upserts
  // son idempotentes y el próximo arranque lo corrige. Caerse acá dejaría la
  // aplicación entera abajo por un problema que se repara solo.
  try {
    await bootstrapSeguridad();
  } catch (error) {
    console.error('❌ Falló el bootstrap de seguridad:', error.message);
  }

  // Reservas creadas antes de que guardaran mayorista_id/agencia_id: se
  // completan antes de atender requests, porque las consultas por tenant
  // filtran por esos campos. Idempotente; si falla, se reintenta al próximo
  // arranque.
  try {
    const completadas = await completarTenantReservas();
    if (completadas > 0) console.log(`🔧 Reservas completadas con su tenant: ${completadas}`);
  } catch (error) {
    console.error('❌ Falló completar el tenant de las reservas:', error.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 TourConnect corriendo en puerto ${PORT} [${process.env.NODE_ENV || 'development'}]`);

    // Tareas periódicas: al iniciar y cada 1 hora. Vencen las cotizaciones
    // fuera de plazo, cancelan las reservas cuyo viaje pasó sin pago y cierran
    // las pagadas cuyo viaje ya terminó. Con TAREAS_PERIODICAS=false no
    // corren en esta instancia (para levantar varias y que lo haga una sola).
    if (process.env.TAREAS_PERIODICAS === 'false') {
      console.log('⏸️ Tareas periódicas deshabilitadas en esta instancia (TAREAS_PERIODICAS=false).');
      return;
    }
    ejecutarTareasPeriodicas();
    intervaloTareas = setInterval(ejecutarTareasPeriodicas, 60 * 60 * 1000);
  });

  // Apagado ordenado: deja de aceptar requests, frena las tareas y cierra
  // la conexión a la base antes de salir.
  const apagar = (senal) => {
    console.log(`\n${senal} recibido: cerrando TourConnect...`);
    clearInterval(intervaloTareas);
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    // Si alguna conexión no se cierra a tiempo, se sale igual.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
};

// Estado de las tareas periódicas, expuesto en /health.
const estadoTareas = { ultima_ejecucion: null, en_ejecucion: false, ultimo_error: null };
let intervaloTareas = null;

const ejecutarTareasPeriodicas = async () => {
  // Si una corrida tarda más que el intervalo, la siguiente no se superpone.
  if (estadoTareas.en_ejecucion) return;
  estadoTareas.en_ejecucion = true;
  try {
    await checkCotizacionesVencidas();
    await cancelarReservasVencidas();
    await cerrarReservasFinalizadas();
    estadoTareas.ultimo_error = null;
  } catch (error) {
    estadoTareas.ultimo_error = error.message;
    console.error('❌ Falló una tarea periódica:', error.message);
  } finally {
    estadoTareas.en_ejecucion = false;
    estadoTareas.ultima_ejecucion = new Date().toISOString();
  }
};

// Errores que se escaparon de un handler: se registran en lugar de dejar el
// proceso en un estado desconocido sin rastro.
process.on('unhandledRejection', (razon) => {
  console.error('❌ Promesa rechazada sin manejar:', razon instanceof Error ? razon.stack : razon);
});
process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error.stack);
  process.exit(1);
});

startServer().catch((error) => {
  console.error('❌ No se pudo iniciar el servidor:', error.message);
  process.exit(1);
});

module.exports = app;
