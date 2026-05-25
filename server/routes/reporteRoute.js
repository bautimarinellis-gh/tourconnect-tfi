const express = require('express');
const {
  getAdminDashboard,
  getReservasPorMes,
  getIngresos,
  getIngresosPorAgencia,
  getIngresosPorProducto,
  getRankingAgencias,
  getMayoristaDashboard,
  getAgenciaDashboard
} = require('../controllers/reporteController');

const auth = require('../middlewares/authMiddleware');
const roleCheck = require('../middlewares/roleMiddleware');
const { tenant } = require('../middlewares/tenantMiddleware');

const router = express.Router();

// Todos los endpoints requieren estar autenticados
router.use(auth);

// ==========================================
// ENDPOINTS ADMIN (rol: admin)
// ==========================================
router.get('/admin/dashboard', roleCheck(['admin']), getAdminDashboard);

// Tenant para el resto (mayorista/agencia)
router.use(tenant);

// ==========================================
// ENDPOINTS MAYORISTA (rol: mayorista)
// ==========================================
router.get('/reservas', roleCheck(['mayorista']), getReservasPorMes);
router.get('/ingresos', roleCheck(['mayorista']), getIngresos);
router.get('/ingresos/agencias', roleCheck(['mayorista']), getIngresosPorAgencia);
router.get('/ingresos/productos', roleCheck(['mayorista']), getIngresosPorProducto);
router.get('/agencias/ranking', roleCheck(['mayorista']), getRankingAgencias);
router.get('/dashboard', roleCheck(['mayorista']), getMayoristaDashboard);

// ==========================================
// ENDPOINTS AGENCIA (rol: agencia)
// ==========================================
router.get('/mi-actividad', roleCheck(['agencia']), getAgenciaDashboard);

module.exports = router;
