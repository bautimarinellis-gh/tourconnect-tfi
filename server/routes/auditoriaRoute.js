const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { getAuditoria, getAuditoriaById } = require('../controllers/auditoriaController');

// Todas las rutas requieren autenticación.
// Los tres roles pueden acceder; el scoping se hace dentro del controller.
router.use(auth, role('admin', 'mayorista', 'agencia'));

router.get('/', getAuditoria);
router.get('/:id', getAuditoriaById);

module.exports = router;
