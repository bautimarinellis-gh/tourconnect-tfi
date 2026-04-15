const { Router } = require('express');
const auth = require('../middlewares/authMiddleware');
const {
  login,
  setPassword,
  forgotPassword,
  resetPassword,
  resetPasswordSimple,
  me,
  logout,
} = require('../controllers/authController');

const router = Router();

// Rutas públicas (no requieren autenticación)
router.post('/login', login);
router.post('/set-password', setPassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/reset-password-simple', resetPasswordSimple);

// Rutas protegidas (requieren JWT válido)
router.get('/me', auth, me);
router.post('/logout', auth, logout);

module.exports = router;
