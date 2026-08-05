const express = require('express');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { checkPermiso, checkPermisoMayorista } = require('../middlewares/permisoMiddleware');

const {
  getCotizaciones,
  createCotizacion,
  getCotizacionById,
  actualizarEstadoCotizacion,
  cancelarCotizacion,
} = require('../controllers/cotizacionController');

const router = express.Router();

// Middleware para todas las rutas de este router
router.use(auth);

router
  .route('/')
  .get(role('mayorista', 'agencia'), checkPermisoMayorista('GestionarCotizaciones'), getCotizaciones)
  .post(role('agencia'), createCotizacion);

router
  .route('/:id')
  .get(role('mayorista', 'agencia'), checkPermisoMayorista('GestionarCotizaciones'), getCotizacionById);

router
  .route('/:id/estado')
  .patch(role('mayorista'), checkPermiso('GestionarCotizaciones'), actualizarEstadoCotizacion);

router
  .route('/:id/cancelar')
  .patch(role('agencia'), cancelarCotizacion);

module.exports = router;
