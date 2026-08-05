const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { checkPermiso, checkPermisoMayorista } = require('../middlewares/permisoMiddleware');

const {
  getReservas,
  createReservaFromCotizacion,
  getReservaById,
  cerrarReserva,
  cancelarReserva,
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
router
  .route('/')
  .get(role('mayorista', 'agencia'), checkPermisoMayorista('GestionarReservas'), getReservas);

// POST /api/v1/reservas/cotizacion/:cotizacionId → Crear reserva (ID en URL, solo agencia)
router
  .route('/cotizacion/:cotizacionId')
  .post(role('agencia'), createReservaFromCotizacion);

// GET /api/v1/reservas/:id  → Detalle de reserva con historial y pagos
router
  .route('/:id')
  .get(role('mayorista', 'agencia'), checkPermisoMayorista('GestionarReservas'), getReservaById);

// PUT /api/v1/reservas/:id/cerrar  → Cerrar reserva (solo mayorista)
router
  .route('/:id/cerrar')
  .put(role('mayorista'), checkPermiso('GestionarReservas'), cerrarReserva);

// PUT /api/v1/reservas/:id/cancelar → Cancelar reserva (ambos roles)
router
  .route('/:id/cancelar')
  .put(role('mayorista', 'agencia'), checkPermisoMayorista('GestionarReservas'), cancelarReserva);

// ---------------------
// Pagos
// ---------------------

// GET /api/v1/reservas/:id/pagos → Listar pagos (ambos roles). El mayorista
// ya no puede registrar un pago directo: siempre tiene que pasar primero
// por que la agencia lo informe (informar-pago) y él lo confirme o rechace.
router
  .route('/:id/pagos')
  .get(role('mayorista', 'agencia'), checkPermisoMayorista('GestionarReservas'), getPagos);

// ---------------------
// Flujo bidireccional de pagos
// ---------------------

// POST /api/v1/reservas/:id/informar-pago → La agencia informa que realizó un pago
router.route('/:id/informar-pago').post(role('agencia'), informarPago);

// POST /api/v1/reservas/:id/confirmar-pago → El mayorista confirma el pago informado
router.route('/:id/confirmar-pago').post(role('mayorista'), checkPermiso('GestionarReservas'), confirmarPago);

// POST /api/v1/reservas/:id/rechazar-pago → El mayorista rechaza el pago informado
router.route('/:id/rechazar-pago').post(role('mayorista'), checkPermiso('GestionarReservas'), rechazarPago);

module.exports = router;
