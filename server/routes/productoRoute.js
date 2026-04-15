const express = require('express');
const {
  getProductos,
  createProducto,
  getProductoById,
  updateProducto,
  deleteProducto,
  checkProductoAgencias,
} = require('../controllers/productosController');
const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { tenant, checkOwnership } = require('../middlewares/tenantMiddleware');
const Producto = require('../models/Producto');

const router = express.Router();

// Middleware: Todas las rutas de productos requieren autenticación
// y solo están disponibles para mayoristas o agencias
router.use(auth);

// GET /api/v1/productos
// - Mayoristas listan sus productos
// - Agencias listan los productos habilitados para ellos
router.get('/', role('mayorista', 'agencia'), getProductos);

// POST /api/v1/productos
// - Solo mayoristas
router.post('/', role('mayorista'), createProducto);

// GET /api/v1/productos/:id
// - Mayoristas devuelven info total
// - Agencias devuelven info modificada si está habilitado
router.get('/:id', role('mayorista', 'agencia'), getProductoById);

// GET /api/v1/productos/:id/agencias
// - Solo mayoristas: retorna cuántas agencias tienen vinculado el producto
router.get(
  '/:id/agencias',
  role('mayorista'),
  tenant,
  checkOwnership(Producto, 'mayorista_id'),
  checkProductoAgencias
);

// PUT /api/v1/productos/:id
// - Solo mayoristas
// - Utiliza tenant() para inyectar req.mayorista_id y checkOwnership() para verificar pertenencia
router.put(
  '/:id',
  role('mayorista'),
  tenant,
  checkOwnership(Producto, 'mayorista_id'),
  updateProducto
);

// DELETE /api/v1/productos/:id
// - Solo mayoristas
// - Utiliza tenant() para inyectar req.mayorista_id y checkOwnership() para verificar pertenencia
router.delete(
  '/:id',
  role('mayorista'),
  tenant,
  checkOwnership(Producto, 'mayorista_id'),
  deleteProducto
);

module.exports = router;
