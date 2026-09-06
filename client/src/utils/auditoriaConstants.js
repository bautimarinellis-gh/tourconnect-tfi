export const ACCION_LABELS = {
  LOGIN_EXITOSO:              'Inicio de sesión',
  LOGIN_FALLIDO:              'Intento de acceso fallido',
  LOGOUT:                     'Cierre de sesión',
  RESET_PASSWORD:             'Contraseña restablecida',
  CAMBIO_PASSWORD:            'Contraseña cambiada',
  USUARIO_CREADO:             'Usuario creado',
  USUARIO_DESACTIVADO:        'Usuario desactivado',
  ACCESO_DENEGADO:            'Acceso denegado por falta de permisos',
  RESERVA_CREADA:             'Reserva creada',
  PAGO_INFORMADO:             'Pago informado',
  PAGO_CONFIRMADO:            'Pago confirmado',
  PAGO_RECHAZADO:             'Pago rechazado',
  RESERVA_CERRADA:            'Reserva cerrada',
  RESERVA_CANCELADA:          'Reserva cancelada',
};

// Scoping "mi actividad": cada rol ve solo sus propias acciones, así que
// el filtro ofrece únicamente las acciones que ese rol ejecuta como actor.
// (Verificado contra los role() de las rutas y los registrarAuditoria de
// cada controller.)

// Admin: gestiona mayoristas. Desactivar un mayorista se audita como
// USUARIO_DESACTIVADO sobre su usuario asociado, no como una acción propia
// de Mayorista (ver adminController.deactivarMayorista).
const SEGURIDAD_ADMIN = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'RESET_PASSWORD', 'CAMBIO_PASSWORD',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO',
];
const NEGOCIO_ADMIN = [];

// Mayorista: gestiona agencias y aprueba/cobra operaciones.
const SEGURIDAD_MAYORISTA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'RESET_PASSWORD', 'CAMBIO_PASSWORD',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO', 'ACCESO_DENEGADO',
];
const NEGOCIO_MAYORISTA = [
  'PAGO_CONFIRMADO', 'PAGO_RECHAZADO',
  'RESERVA_CERRADA', 'RESERVA_CANCELADA',
];

// Agencia: cotiza, reserva e informa pagos.
const SEGURIDAD_AGENCIA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'RESET_PASSWORD', 'CAMBIO_PASSWORD',
];
const NEGOCIO_AGENCIA = [
  'RESERVA_CREADA', 'PAGO_INFORMADO', 'RESERVA_CANCELADA',
];

export const ACCIONES_POR_ROL = {
  admin:     { seguridad: SEGURIDAD_ADMIN,     negocio: NEGOCIO_ADMIN },
  mayorista: { seguridad: SEGURIDAD_MAYORISTA, negocio: NEGOCIO_MAYORISTA },
  agencia:   { seguridad: SEGURIDAD_AGENCIA,   negocio: NEGOCIO_AGENCIA },
};
