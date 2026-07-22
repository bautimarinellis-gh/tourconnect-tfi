const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const { enviarEmail } = require('../utils/mailer');
const { resolverContextoPersona, enriquecerUsuario } = require('../utils/personaContext');
const { registrarAuditoria } = require('../utils/auditService');

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

// Recuperación de contraseña por código de verificación
const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // ventana para setear la nueva contraseña
const MAX_INTENTOS_CODIGO = 5;

const hashCodigo = (codigo) =>
  crypto.createHash('sha256').update(String(codigo)).digest('hex');

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
      await registrarAuditoria({
        req,
        accion: 'LOGIN_FALLIDO',
        usuario_id: null,
        mayorista_id: null,
        resultado: 'fallido',
        detalle: { email_intentado: email, motivo: 'email_no_encontrado' },
      });
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    // Verificar contraseña
    if (!usuario.password_hash) {
      await registrarAuditoria({
        req,
        accion: 'LOGIN_FALLIDO',
        usuario_id: usuario._id,
        mayorista_id: null,
        resultado: 'fallido',
        detalle: { email_intentado: email, motivo: 'sin_password_configurado' },
      });
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    const passwordValido = await usuario.compararPassword(password);

    if (!passwordValido) {
      await registrarAuditoria({
        req,
        accion: 'LOGIN_FALLIDO',
        usuario_id: usuario._id,
        mayorista_id: null,
        resultado: 'fallido',
        detalle: { email_intentado: email, motivo: 'credenciales_invalidas' },
      });
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    // Verificar que la cuenta de usuario esté activa
    if (!usuario.activo) {
      await registrarAuditoria({
        req,
        accion: 'LOGIN_FALLIDO',
        usuario_id: usuario._id,
        mayorista_id: null,
        resultado: 'fallido',
        detalle: { email_intentado: email, motivo: 'cuenta_inactiva' },
      });
      return res.status(403).json({
        success: false,
        message: 'Tu cuenta no está activa. Revisá tu email de invitación.',
      });
    }

    const contexto = await resolverContextoPersona(usuario);

    if (usuario.rol === 'mayorista') {
      if (!contexto.persona) {
        await registrarAuditoria({
          req,
          accion: 'LOGIN_FALLIDO',
          usuario_id: usuario._id,
          mayorista_id: null,
          resultado: 'fallido',
          detalle: { email_intentado: email, motivo: 'perfil_mayorista_no_encontrado' },
        });
        return res.status(403).json({
          success: false,
          message: 'No se encontró el perfil de mayorista asociado.',
        });
      }
      if (contexto.persona.activo !== true) {
        await registrarAuditoria({
          req,
          accion: 'LOGIN_FALLIDO',
          usuario_id: usuario._id,
          mayorista_id: contexto.mayorista_id ?? null,
          resultado: 'fallido',
          detalle: { email_intentado: email, motivo: 'mayorista_desactivado' },
        });
        return res.status(403).json({
          success: false,
          message: 'El mayorista está desactivado. Contactá al administrador.',
        });
      }
    } else if (usuario.rol === 'agencia') {
      if (!contexto.persona) {
        await registrarAuditoria({
          req,
          accion: 'LOGIN_FALLIDO',
          usuario_id: usuario._id,
          mayorista_id: contexto.mayorista_id ?? null,
          resultado: 'fallido',
          detalle: { email_intentado: email, motivo: 'perfil_agencia_no_encontrado' },
        });
        return res.status(403).json({
          success: false,
          message: 'No se encontró el perfil de agencia asociado.',
        });
      }
      if (contexto.persona.activo !== true) {
        await registrarAuditoria({
          req,
          accion: 'LOGIN_FALLIDO',
          usuario_id: usuario._id,
          mayorista_id: contexto.mayorista_id ?? null,
          agencia_id: contexto.agencia_id ?? null,
          resultado: 'fallido',
          detalle: { email_intentado: email, motivo: 'agencia_desactivada' },
        });
        return res.status(403).json({
          success: false,
          message: 'La agencia está desactivada. Contactá al administrador.',
        });
      }
    }

    const token = generarToken(usuario, contexto);

    registrarAuditoria({
      req,
      accion: 'LOGIN_EXITOSO',
      usuario_id: usuario._id,
      mayorista_id: contexto.mayorista_id ?? null,
      agencia_id: contexto.agencia_id ?? null,
      detalle: { rol: usuario.rol },
    });

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

    registrarAuditoria({
      req,
      accion: 'SET_PASSWORD',
      usuario_id: usuario._id,
      mayorista_id: null,
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
    });

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

    // Generar código de verificación de 6 dígitos.
    // Se guarda solo el hash: si alguien lee la base, no puede usar el código.
    const codigo = crypto.randomInt(100000, 1000000).toString();
    usuario.reset_code_hash = hashCodigo(codigo);
    usuario.reset_code_expires = new Date(Date.now() + RESET_CODE_TTL_MS);
    usuario.reset_code_attempts = 0;
    // Invalidar cualquier token de reset previo
    usuario.reset_token = undefined;
    usuario.reset_token_expires = undefined;
    await usuario.save();

    registrarAuditoria({
      req,
      accion: 'RESET_PASSWORD_SOLICITADO',
      usuario_id: usuario._id,
      mayorista_id: null,
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
      detalle: { email: usuario.email },
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Restablecer contraseña</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña en TourConnect.</p>
        <p>Ingresá el siguiente código de verificación en la pantalla de recuperación:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                  text-align: center; padding: 16px; background-color: #f3f4f6;
                  border-radius: 6px; color: #111827;">
          ${codigo}
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          Este código expira en 15 minutos. Si no solicitaste este cambio, ignorá este email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #9ca3af; font-size: 12px;">TourConnect — Gestión de reservas turísticas</p>
      </div>
    `;

    try {
      await enviarEmail({
        para: usuario.email,
        asunto: 'TourConnect — Código para restablecer contraseña',
        html,
      });
    } catch (emailError) {
      console.error('Error enviando email de reset:', emailError.message);
      // No fallar la request si el email no se pudo enviar
    }

    res.json({
      success: true,
      data: {
        message: 'Si el email existe, recibirás un código para restablecer tu contraseña.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/verify-reset-code
 * Verifica el código de 6 dígitos y lo canjea por un reset_token de un solo uso.
 * La respuesta es genérica ante email inexistente, código incorrecto o expirado,
 * para no dar información a un atacante.
 */
const verifyResetCode = async (req, res, next) => {
  try {
    const { email, codigo } = req.body;

    if (!email || !codigo) {
      return res.status(400).json({
        success: false,
        message: 'Email y código son obligatorios.',
      });
    }

    const respuestaInvalida = () =>
      res.status(400).json({
        success: false,
        message: 'Código inválido o expirado.',
      });

    const usuario = await Usuario.findOne({ email }).select(
      '+reset_code_hash +reset_code_expires +reset_code_attempts'
    );

    if (!usuario || !usuario.reset_code_hash) {
      return respuestaInvalida();
    }

    if (usuario.reset_code_expires && usuario.reset_code_expires < new Date()) {
      return respuestaInvalida();
    }

    // Con 6 dígitos el código es fuerza-brutable: cortar tras N intentos
    if (usuario.reset_code_attempts >= MAX_INTENTOS_CODIGO) {
      await registrarAuditoria({
        req,
        accion: 'RESET_CODE_FALLIDO',
        usuario_id: usuario._id,
        mayorista_id: null,
        resultado: 'fallido',
        detalle: { email: usuario.email, motivo: 'max_intentos_superado' },
      });
      return respuestaInvalida();
    }

    if (hashCodigo(codigo) !== usuario.reset_code_hash) {
      usuario.reset_code_attempts += 1;
      await usuario.save();
      await registrarAuditoria({
        req,
        accion: 'RESET_CODE_FALLIDO',
        usuario_id: usuario._id,
        mayorista_id: null,
        resultado: 'fallido',
        detalle: {
          email: usuario.email,
          motivo: 'codigo_incorrecto',
          intento: usuario.reset_code_attempts,
        },
      });
      return respuestaInvalida();
    }

    // Código correcto: se consume y se canjea por un token aleatorio de un solo uso
    const resetToken = crypto.randomBytes(32).toString('hex');
    usuario.reset_code_hash = undefined;
    usuario.reset_code_expires = undefined;
    usuario.reset_code_attempts = 0;
    usuario.reset_token = resetToken;
    usuario.reset_token_expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await usuario.save();

    res.json({
      success: true,
      data: { reset_token: resetToken },
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

    registrarAuditoria({
      req,
      accion: 'RESET_PASSWORD',
      usuario_id: usuario._id,
      mayorista_id: null,
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
    });

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
 * PUT /api/v1/auth/change-password
 * Cambia la contraseña del usuario autenticado, verificando la actual.
 */
const changePassword = async (req, res, next) => {
  try {
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña actual y la nueva son obligatorias.',
      });
    }

    if (String(password_nueva).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
    }

    const usuario = await Usuario.findById(req.usuario.id).select('+password_hash');
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const passwordValido = await usuario.compararPassword(password_actual);
    if (!passwordValido) {
      return res.status(401).json({
        success: false,
        message: 'La contraseña actual es incorrecta.',
      });
    }

    usuario.password_hash = await Usuario.hashPassword(password_nueva);
    await usuario.save();

    registrarAuditoria({
      req,
      accion: 'CAMBIO_PASSWORD',
      usuario_id: usuario._id,
      mayorista_id: req.usuario.mayorista_id ?? null,
      agencia_id: req.usuario.agencia_id ?? null,
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
    });

    res.json({
      success: true,
      data: { message: 'Contraseña actualizada correctamente.' },
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

  registrarAuditoria({ req, accion: 'LOGOUT' });

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
  verifyResetCode,
  resetPassword,
  me,
  changePassword,
  logout,
  tokenBlacklist,
};
