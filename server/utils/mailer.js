const nodemailer = require('nodemailer');

/**
 * Crea el transporter de nodemailer con la configuración SMTP
 * definida en las variables de entorno.
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Envía un email genérico.
 * @param {Object} opciones
 * @param {string} opciones.para|to — dirección del destinatario
 * @param {string} opciones.asunto|subject — asunto del email
 * @param {string} opciones.html — cuerpo del email en HTML
 */
const enviarEmail = async ({ para, asunto, html, to, subject }) => {
  // Deshabilitado: no se envían emails por ahora
  if (process.env.ENABLE_EMAIL !== 'true') {
    return null;
  }
  const destinatario = para || to;
  const asuntoEmail = asunto || subject;
  if (!destinatario || !asuntoEmail || !html) {
    throw new Error('Faltan parámetros para enviar email (para/to, asunto/subject, html)');
  }
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass || user.includes('tu_usuario') || pass.includes('tu_password')) {
    console.warn('⚠️ SMTP no configurado: usa credenciales reales en .env (SMTP_USER, SMTP_PASS) para enviar emails.');
    return null;
  }
  const transporter = createTransporter();

  const mailOptions = {
    from: `"TourConnect" <${process.env.EMAIL_FROM}>`,
    to: destinatario,
    subject: asuntoEmail,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email enviado: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Error enviando email: ${error.message}`);
    throw error;
  }
};

/**
 * Envía el email de invitación con el link para setear contraseña.
 * @param {string} email — email del destinatario
 * @param {string} token — token de invitación
 * @param {string} rol — rol del usuario invitado
 */
const enviarInvitacion = async (email, token, rol) => {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${baseUrl}/set-password?token=${token}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">¡Bienvenido a TourConnect!</h2>
      <p>Fuiste invitado como <strong>${rol}</strong> a la plataforma.</p>
      <p>Hacé clic en el siguiente botón para configurar tu contraseña:</p>
      <a href="${link}"
         style="display: inline-block; padding: 12px 24px; background-color: #2563eb;
                color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Configurar contraseña
      </a>
      <p style="color: #6b7280; font-size: 14px;">
        Este enlace expira en 48 horas.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb;" />
      <p style="color: #9ca3af; font-size: 12px;">TourConnect — Gestión de reservas turísticas</p>
    </div>
  `;

  return enviarEmail({
    para: email,
    asunto: 'Invitación a TourConnect — Configurá tu contraseña',
    html,
  });
};

/**
 * Envía el email de reseteo de clave forzado por un administrador: un link
 * de un solo uso para que el usuario defina una contraseña nueva.
 * @param {string} email — email del destinatario
 * @param {string} nombre — nombre del usuario, para personalizar el saludo
 * @param {string} token — reset_token de un solo uso
 */
const enviarResetClave = async (email, nombre, token) => {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${baseUrl}/reset-password?token=${token}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Restablecer contraseña</h2>
      <p>Hola${nombre ? ` ${nombre}` : ''},</p>
      <p>Un administrador solicitó restablecer tu contraseña en TourConnect.</p>
      <p>Hacé clic en el siguiente botón para definir una contraseña nueva:</p>
      <a href="${link}"
         style="display: inline-block; padding: 12px 24px; background-color: #2563eb;
                color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Definir nueva contraseña
      </a>
      <p style="color: #6b7280; font-size: 14px;">
        Este enlace expira en 48 horas. Si no esperabas este email, contactá a tu administrador.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb;" />
      <p style="color: #9ca3af; font-size: 12px;">TourConnect — Gestión de reservas turísticas</p>
    </div>
  `;

  return enviarEmail({
    para: email,
    asunto: 'TourConnect — Restablecé tu contraseña',
    html,
  });
};

const MOTIVOS_LABEL = {
  incumplimiento_pago: 'Incumplimiento de pago',
  incumplimiento_terminos: 'Incumplimiento de términos y condiciones',
  inactividad: 'Inactividad prolongada',
  solicitud_agencia: 'Solicitud de la propia agencia',
  solicitud_mayorista: 'Solicitud del propio mayorista',
  otro: 'Otro',
};

/**
 * Envía el email notificando que una cuenta (agencia o mayorista) fue desactivada.
 * @param {string} email — email del destinatario
 * @param {string} nombreEntidad — nombre de la agencia/mayorista desactivado
 * @param {string} motivo — clave del motivo (ver MOTIVOS_LABEL)
 * @param {string} [mensaje] — mensaje adicional opcional de quien desactiva
 */
const enviarNotificacionDesactivacion = async (email, nombreEntidad, motivo, mensaje) => {
  const motivoLabel = MOTIVOS_LABEL[motivo] || 'No especificado';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Cuenta desactivada</h2>
      <p>Hola,</p>
      <p>Te informamos que la cuenta de <strong>${nombreEntidad}</strong> en TourConnect fue desactivada.</p>
      <p><strong>Motivo:</strong> ${motivoLabel}</p>
      ${mensaje ? `<p><strong>Mensaje:</strong><br />${mensaje}</p>` : ''}
      <p style="color: #6b7280; font-size: 14px;">
        Si considerás que esto es un error, comunicate para más información.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb;" />
      <p style="color: #9ca3af; font-size: 12px;">TourConnect — Gestión de reservas turísticas</p>
    </div>
  `;

  return enviarEmail({
    para: email,
    asunto: 'TourConnect — Tu cuenta fue desactivada',
    html,
  });
};

/**
 * Envía el email notificando que una cuenta (agencia o mayorista) fue reactivada.
 * @param {string} email — email del destinatario
 * @param {string} nombreEntidad — nombre de la agencia/mayorista reactivado
 */
const enviarNotificacionReactivacion = async (email, nombreEntidad) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">¡Bienvenido de nuevo!</h2>
      <p>Hola,</p>
      <p>Te informamos que la cuenta de <strong>${nombreEntidad}</strong> en TourConnect fue reactivada. Ya podés volver a ingresar al sistema con normalidad.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb;" />
      <p style="color: #9ca3af; font-size: 12px;">TourConnect — Gestión de reservas turísticas</p>
    </div>
  `;

  return enviarEmail({
    para: email,
    asunto: 'TourConnect — Tu cuenta fue reactivada',
    html,
  });
};

module.exports = {
  enviarEmail,
  enviarInvitacion,
  enviarResetClave,
  enviarNotificacionDesactivacion,
  enviarNotificacionReactivacion,
};
