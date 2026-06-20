const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../middlewares/authMiddleware');
const {
  login,
  setPassword,
  forgotPassword,
  resetPassword,
  me,
  logout,
} = require('../controllers/authController');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
});

// Rutas públicas (no requieren autenticación)
router.post('/login', authLimiter, login);
router.post('/set-password', setPassword);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Rutas protegidas (requieren JWT válido)
router.get('/me', auth, me);
router.post('/logout', auth, logout);

module.exports = router;
