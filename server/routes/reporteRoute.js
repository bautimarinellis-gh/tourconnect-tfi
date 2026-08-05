const express = require('express');
const {
  getAdminDashboard,
  getIngresos,
  getIngresosPorProducto,
  getRankingAgencias,
  getMayoristaDashboard,
  getAgenciaDashboard,
  exportarReportePDF
} = require('../controllers/reporteController');

const auth = require('../middlewares/authMiddleware');
const roleCheck = require('../middlewares/roleMiddleware');
const { tenant } = require('../middlewares/tenantMiddleware');
const { checkPermiso } = require('../middlewares/permisoMiddleware');

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
router.get('/ingresos', roleCheck(['mayorista']), checkPermiso('VerReportes'), getIngresos);
router.get('/ingresos/productos', roleCheck(['mayorista']), checkPermiso('VerReportes'), getIngresosPorProducto);
router.get('/agencias/ranking', roleCheck(['mayorista']), checkPermiso('VerReportes'), getRankingAgencias);
// El dashboard del mayorista no exige permiso: es la home de cualquier
// usuario autenticado del tenant.
router.get('/dashboard', roleCheck(['mayorista']), getMayoristaDashboard);
router.get('/exportar', roleCheck(['mayorista']), checkPermiso('VerReportes'), exportarReportePDF);

// ==========================================
// ENDPOINTS AGENCIA (rol: agencia)
// ==========================================
router.get('/mi-actividad', roleCheck(['agencia']), getAgenciaDashboard);

module.exports = router;
