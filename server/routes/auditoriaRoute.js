const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { checkPermisoMayorista } = require('../middlewares/permisoMiddleware');
const { getAuditoria, getAuditoriaById } = require('../controllers/auditoriaController');

// Todas las rutas requieren autenticación.
// Los tres roles pueden acceder; el scoping se hace dentro del controller.
// Del lado del mayorista, además, la auditoría no es para cualquiera: es solo
// lectura y exige VerAuditoria. La agencia ve únicamente sus propios eventos,
// filtrados en el controller.
router.use(auth, role('admin', 'mayorista', 'agencia'));

router.get('/', checkPermisoMayorista('VerAuditoria'), getAuditoria);
router.get('/:id', checkPermisoMayorista('VerAuditoria'), getAuditoriaById);

module.exports = router;
