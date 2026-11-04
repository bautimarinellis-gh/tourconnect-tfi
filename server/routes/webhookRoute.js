const express = require('express');
const { webhook } = require('../controllers/pagoPasarelaController');
const { limiteWebhook } = require('../middlewares/limitadores');

const router = express.Router();

// POST /api/v1/webhooks/mercadopago → Notificaciones de pago de Mercado Pago.
// Sin auth: la llama MP. Se valida con la firma x-signature (ver controller).
router.post('/mercadopago', limiteWebhook, webhook);

module.exports = router;
