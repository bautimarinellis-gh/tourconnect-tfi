const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');

const {
  getMayoristas,
  crearMayorista,
  getMayoristaById,
  updateMayorista,
  deleteMayorista,
  reactivarMayorista,
  activarUsuarioMayorista,
  getGlobalStats,
} = require('../controllers/adminController');

// Todas las rutas en este archivo requieren autenticación y rol 'admin'
router.use(auth, role('admin'));

// Estadísticas globales (poner antes de /:id para evitar choques)
router.get('/stats', getGlobalStats);

// CRUD de Mayoristas
router.route('/mayoristas')
  .get(getMayoristas)
  .post(crearMayorista);

router.post('/mayoristas/:id/activar-usuario', activarUsuarioMayorista);
router.patch('/mayoristas/:id/reactivar', reactivarMayorista);

router.route('/mayoristas/:id')
  .get(getMayoristaById)
  .put(updateMayorista)
  .delete(deleteMayorista);

module.exports = router;
