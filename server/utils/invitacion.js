/**
 * Plazo de los links que se mandan por email para que un usuario defina su
 * contraseña: la invitación inicial y el reseteo forzado por un administrador.
 *
 * Se configura con INVITE_TOKEN_EXPIRES_HOURS (por defecto 48). Lo usan los
 * controllers que generan el token y el texto del email, así el plazo que
 * se aplica y el que se le informa al usuario no pueden quedar distintos.
 */

const HORAS_POR_DEFECTO = 48;

const horasInvitacion = () => {
  const horas = Number(process.env.INVITE_TOKEN_EXPIRES_HOURS);
  return Number.isFinite(horas) && horas > 0 ? horas : HORAS_POR_DEFECTO;
};

/** Fecha de vencimiento de un link emitido ahora. */
const vencimientoInvitacion = () => new Date(Date.now() + horasInvitacion() * 60 * 60 * 1000);

module.exports = { horasInvitacion, vencimientoInvitacion };
