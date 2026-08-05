const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const dotenv = require('dotenv');
const helmet = require('helmet');
const connectDB = require('./config/db');

// Cargar variables de entorno
dotenv.config({ path: '../.env' });

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

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Logger HTTP solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ---------------------
// Rutas
// ---------------------
// Ruta de health-check
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
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
const { bootstrapSeguridad } = require('./utils/bootstrapSeguridad');

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

  app.listen(PORT, () => {
    console.log(`🚀 TourConnect corriendo en puerto ${PORT} [${process.env.NODE_ENV || 'development'}]`);

    // Ejecutar al iniciar
    checkCotizacionesVencidas();

    // Ejecutar cada 1 hora (3600000 ms)
    setInterval(checkCotizacionesVencidas, 60 * 60 * 1000);
  });
};

startServer();

module.exports = app;
