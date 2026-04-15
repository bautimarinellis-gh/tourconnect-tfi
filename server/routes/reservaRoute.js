const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');

const {
  getReservas,
  createReserva,
  createReservaFromCotizacion,
  getReservaById,
  pagarReserva,
  cerrarReserva,
  cancelarReserva,
  getHistorial,
  createPago,
  getPagos,
  informarPago,
  confirmarPago,
  rechazarPago,
} = require('../controllers/reservaController');

const router = express.Router();

// Middleware: Todas las rutas requieren autenticación
router.use(auth);

// ---------------------
// Reservas
// ---------------------

// GET  /api/v1/reservas     → Listar reservas (mayorista o agencia)
// POST /api/v1/reservas     → Crear reserva desde cotización (solo agencia)
router
  .route('/')
  .get(role('mayorista', 'agencia'), getReservas)
  .post(role('agencia'), createReserva);

// POST /api/v1/reservas/cotizacion/:cotizacionId → Crear reserva (ID en URL, solo agencia)
router
  .route('/cotizacion/:cotizacionId')
  .post(role('agencia'), createReservaFromCotizacion);

// GET /api/v1/reservas/:id  → Detalle de reserva con historial y pagos
router
  .route('/:id')
  .get(role('mayorista', 'agencia'), getReservaById);

// PUT /api/v1/reservas/:id/pagar   → Marcar como pagada (solo mayorista)
router
  .route('/:id/pagar')
  .put(role('mayorista'), pagarReserva);

// PUT /api/v1/reservas/:id/cerrar  → Cerrar reserva (solo mayorista)
router
  .route('/:id/cerrar')
  .put(role('mayorista'), cerrarReserva);

// PUT /api/v1/reservas/:id/cancelar → Cancelar reserva (ambos roles)
router
  .route('/:id/cancelar')
  .put(role('mayorista', 'agencia'), cancelarReserva);

// ---------------------
// Historial
// ---------------------

// GET /api/v1/reservas/:id/historial → Historial de estados (ambos roles)
router
  .route('/:id/historial')
  .get(role('mayorista', 'agencia'), getHistorial);

// ---------------------
// Pagos
// ---------------------

// POST /api/v1/reservas/:id/pagos → Registrar pago (solo mayorista)
// GET  /api/v1/reservas/:id/pagos → Listar pagos (ambos roles)
router
  .route('/:id/pagos')
  .post(role('mayorista'), createPago)
  .get(role('mayorista', 'agencia'), getPagos);

// ---------------------
// Flujo bidireccional de pagos
// ---------------------

// POST /api/v1/reservas/:id/informar-pago → La agencia informa que realizó un pago
router.route('/:id/informar-pago').post(role('agencia'), informarPago);

// POST /api/v1/reservas/:id/confirmar-pago → El mayorista confirma el pago informado
router.route('/:id/confirmar-pago').post(role('mayorista'), confirmarPago);

// POST /api/v1/reservas/:id/rechazar-pago → El mayorista rechaza el pago informado
router.route('/:id/rechazar-pago').post(role('mayorista'), rechazarPago);

module.exports = router;
