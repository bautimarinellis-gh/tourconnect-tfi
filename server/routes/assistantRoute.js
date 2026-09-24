const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { tenant } = require('../middlewares/tenantMiddleware');
const { checkPermiso } = require('../middlewares/permisoMiddleware');
const intentCatalog = require('../utils/intentCatalog');
const { query } = require('../controllers/assistantController');

// Permisos que habilitan al menos una intención. Quien no tiene ninguno no
// puede consultar nada, así que se lo corta acá; el permiso de cada intención
// puntual lo valida el controller una vez clasificada la pregunta.
const permisosDelAsistente = [...new Set(Object.values(intentCatalog).map((i) => i.permiso))];

// Todas las rutas requieren autenticación, rol mayorista, tenant y algún
// permiso del asistente
router.use(auth, role('mayorista'), tenant, checkPermiso(...permisosDelAsistente));

router.post('/query', query);

module.exports = router;
