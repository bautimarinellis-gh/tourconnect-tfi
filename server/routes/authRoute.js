const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../middlewares/authMiddleware');
const {
  login,
  setPassword,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  me,
  changePassword,
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

// Limiter propio para el flujo de recuperación: no comparte cupo con login
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
});

// Rutas públicas (no requieren autenticación)
router.post('/login', authLimiter, login);
router.post('/set-password', authLimiter, setPassword);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/verify-reset-code', resetLimiter, verifyResetCode);
router.post('/reset-password', resetLimiter, resetPassword);

// Rutas protegidas (requieren JWT válido)
router.get('/me', auth, me);
router.put('/change-password', auth, changePassword);
router.post('/logout', auth, logout);

module.exports = router;
