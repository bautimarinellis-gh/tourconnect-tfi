const express = require('express');
const router = express.Router();

const {
  getAgencias,
  createAgencia,
  getAgencia,
  updateAgencia,
  deleteAgencia,
  verificarDesactivacion,
  reactivarAgencia,
  getHistorialAgencia,
} = require('../controllers/agenciaController');

const {
  getProductosAgencia,
  addProductoAgencia,
  syncProductosAgencia,
  updateProductoAgencia,
  deleteProductoAgencia,
} = require('../controllers/agenciaProductoController');

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { tenant } = require('../middlewares/tenantMiddleware');
const { checkPermiso } = require('../middlewares/permisoMiddleware');

// Proteger todas las rutas, requerir rol mayorista y validar tenant_id
router.use(auth);
router.use(role('mayorista'));
router.use(tenant);

// Rutas de Agencia
router.route('/')
  .get(checkPermiso('GestionarAgencias'), getAgencias)
  .post(checkPermiso('GestionarAgencias'), createAgencia);

router.get('/:id/verificar-desactivacion', checkPermiso('GestionarAgencias'), verificarDesactivacion);
router.patch('/:id/reactivar', checkPermiso('GestionarAgencias'), reactivarAgencia);
router.get('/:id/historial', checkPermiso('GestionarAgencias'), getHistorialAgencia);

router.route('/:id')
  .get(checkPermiso('GestionarAgencias'), getAgencia)
  .put(checkPermiso('GestionarAgencias'), updateAgencia)
  .delete(checkPermiso('GestionarAgencias'), deleteAgencia);

// Rutas de AgenciaProducto (nested bajo agencia/:id/productos).
// Qué productos vende cada agencia y con qué margen es configuración de la
// agencia, así que todo el subárbol se resuelve con GestionarAgencias.
router.route('/:id/productos')
  .get(checkPermiso('GestionarAgencias'), getProductosAgencia)
  .post(checkPermiso('GestionarAgencias'), addProductoAgencia)
  .put(checkPermiso('GestionarAgencias'), syncProductosAgencia);

router.route('/:id/productos/:productoId')
  .put(checkPermiso('GestionarAgencias'), updateProductoAgencia)
  .delete(checkPermiso('GestionarAgencias'), deleteProductoAgencia);

module.exports = router;
