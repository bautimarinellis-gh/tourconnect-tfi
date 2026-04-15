const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');

const {
  getPerfil,
  updatePerfil,
} = require('../controllers/mayoristaController');

// Todas las rutas en este archivo requieren autenticación y rol 'mayorista'
router.use(auth, role('mayorista'));

router.route('/perfil')
  .get(getPerfil)
  .put(updatePerfil);

module.exports = router;
