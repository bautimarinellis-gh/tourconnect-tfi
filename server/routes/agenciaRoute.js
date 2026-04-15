const express = require('express');
const router = express.Router();

const {
  getAgencias,
  createAgencia,
  getAgencia,
  updateAgencia,
  deleteAgencia,
  verificarDesactivacion,
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

// Proteger todas las rutas, requerir rol mayorista y validar tenant_id
router.use(auth);
router.use(role('mayorista'));
router.use(tenant);

// Rutas de Agencia
router.route('/')
  .get(getAgencias)
  .post(createAgencia);

router.get('/:id/verificar-desactivacion', verificarDesactivacion);

router.route('/:id')
  .get(getAgencia)
  .put(updateAgencia)
  .delete(deleteAgencia);

// Rutas de AgenciaProducto (nested bajo agencia/:id/productos)
router.route('/:id/productos')
  .get(getProductosAgencia)
  .post(addProductoAgencia)
  .put(syncProductosAgencia);

router.route('/:id/productos/:productoId')
  .put(updateProductoAgencia)
  .delete(deleteProductoAgencia);

module.exports = router;
