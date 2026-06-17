const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const { enviarEmail } = require('../utils/mailer');
const { resolverContextoPersona, enriquecerUsuario } = require('../utils/personaContext');

// ---------------------
// Helpers
// ---------------------

/**
 * Genera un JWT con los datos del usuario y contexto de negocio.
 */
const generarToken = (usuario, contexto) => {
  return jwt.sign(
    {
      id: usuario._id,
      email: usuario.email,
      rol: usuario.rol,
      mayorista_id: contexto.mayorista_id || null,
      agencia_id: contexto.agencia_id || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Set en memoria para tokens invalidados (logout).
 * En producción debería reemplazarse por Redis.
 */
const tokenBlacklist = new Set();

// ---------------------
// Controllers
// ---------------------

/**
 * POST /api/v1/auth/login
 * Autentica un usuario con email y password.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email y contraseña son obligatorios.',
      });
    }

    // Buscar usuario con password_hash incluido
    const usuario = await Usuario.findOne({ email }).select('+password_hash');

    if (!usuario) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    // Verificar contraseña
    if (!usuario.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    const passwordValido = await usuario.compararPassword(password);

    if (!passwordValido) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    // Verificar que la cuenta de usuario esté activa
    if (!usuario.activo) {
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta no está activa. Revisá tu email de invitación.',
      });
    }

    const contexto = await resolverContextoPersona(usuario);

    if (usuario.rol === 'mayorista') {
      if (!contexto.persona) {
        return res.status(403).json({
          success: false,
          message: 'No se encontró el perfil de mayorista asociado.',
        });
      }
      if (contexto.persona.activo !== true) {
        return res.status(403).json({
          success: false,
          message: 'El mayorista está desactivado. Contactá al administrador.',
        });
      }
    } else if (usuario.rol === 'agencia') {
      if (!contexto.persona) {
        return res.status(403).json({
          success: false,
          message: 'No se encontró el perfil de agencia asociado.',
        });
      }
      if (contexto.persona.activo !== true) {
        return res.status(403).json({
          success: false,
          message: 'La agencia está desactivada. Contactá al administrador.',
        });
      }
    }

    const token = generarToken(usuario, contexto);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        usuario: enriquecerUsuario(usuario, contexto),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/set-password
 * Configura la contraseña usando el invite_token.
 */
const setPassword = async (req, res, next) => {
  try {
    const { invite_token, password } = req.body;

    if (!invite_token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token de invitación y contraseña son obligatorios.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres.',
      });
    }

    // Buscar usuario con el invite_token
    const usuario = await Usuario.findOne({ invite_token }).select(
      '+invite_token +invite_token_expires'
    );

    if (!usuario) {
      return res.status(400).json({
        success: false,
        message: 'Token de invitación inválido.',
      });
    }

    // Verificar que el token no haya expirado
    if (usuario.invite_token_expires && usuario.invite_token_expires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'El token de invitación ha expirado.',
      });
    }

    // Hashear la password y activar la cuenta
    usuario.password_hash = await Usuario.hashPassword(password);
    usuario.activo = true;
    usuario.invite_token = undefined;
    usuario.invite_token_expires = undefined;
    await usuario.save();

    res.json({
      success: true,
      data: {
        message: 'Contraseña configurada correctamente. Ya podés iniciar sesión.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/forgot-password
 * Genera un token de reset y envía email.
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'El email es obligatorio.',
      });
    }

    const usuario = await Usuario.findOne({ email });

    if (!usuario) {
      // Por seguridad, no revelar si el email existe
      return res.json({
        success: true,
        data: {
          message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.',
        },
      });
    }

    // Generar token de reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    usuario.reset_token = resetToken;
    usuario.reset_token_expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas
    await usuario.save();

    // Enviar email de reset
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Restablecer contraseña</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña en TourConnect.</p>
        <p>Hacé clic en el siguiente botón para crear una nueva contraseña:</p>
        <a href="${resetLink}"
           style="display: inline-block; padding: 12px 24px; background-color: #2563eb;
                  color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Restablecer contraseña
        </a>
        <p style="color: #6b7280; font-size: 14px;">
          Este enlace expira en 48 horas. Si no solicitaste este cambio, ignorá este email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #9ca3af; font-size: 12px;">TourConnect — Gestión de reservas turísticas</p>
      </div>
    `;

    try {
      await enviarEmail({
        para: usuario.email,
        asunto: 'TourConnect — Restablecer contraseña',
        html,
      });
    } catch (emailError) {
      console.error('Error enviando email de reset:', emailError.message);
      // No fallar la request si el email no se pudo enviar
    }

    res.json({
      success: true,
      data: {
        message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/reset-password
 * Restablece la contraseña usando el reset_token.
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token y contraseña son obligatorios.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres.',
      });
    }

    // Buscar usuario con el reset_token
    const usuario = await Usuario.findOne({ reset_token: token }).select(
      '+reset_token +reset_token_expires'
    );

    if (!usuario) {
      return res.status(400).json({
        success: false,
        message: 'Token de reset inválido.',
      });
    }

    // Verificar que el token no haya expirado
    if (usuario.reset_token_expires && usuario.reset_token_expires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'El token de reset ha expirado.',
      });
    }

    // Hashear la nueva password
    usuario.password_hash = await Usuario.hashPassword(password);
    usuario.reset_token = undefined;
    usuario.reset_token_expires = undefined;
    await usuario.save();

    res.json({
      success: true,
      data: {
        message: 'Contraseña restablecida correctamente.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/auth/me
 * Devuelve datos del usuario autenticado.
 */
const me = async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const contexto = await resolverContextoPersona(usuario);

    res.json({
      success: true,
      data: { usuario: enriquecerUsuario(usuario, contexto) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout
 * Invalida el token actual.
 */
const logout = (req, res) => {
  const token = req.cookies?.token;

  if (token) {
    tokenBlacklist.add(token);
  }

  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  res.json({
    success: true,
    data: {
      message: 'Sesión cerrada correctamente.',
    },
  });
};

module.exports = {
  login,
  setPassword,
  forgotPassword,
  resetPassword,
  me,
  logout,
  tokenBlacklist,
};
