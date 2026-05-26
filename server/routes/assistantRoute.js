const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { tenant } = require('../middlewares/tenantMiddleware');
const { query } = require('../controllers/assistantController');

// Todas las rutas requieren autenticación, rol mayorista y tenant
router.use(auth, role('mayorista'), tenant);

router.post('/query', query);

module.exports = router;
