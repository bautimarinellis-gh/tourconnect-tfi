export const ACCION_LABELS = {
  LOGIN_EXITOSO:              'Inicio de sesión',
  LOGIN_FALLIDO:              'Intento de acceso fallido',
  LOGOUT:                     'Cierre de sesión',
  RESET_PASSWORD:             'Contraseña restablecida',
  CAMBIO_PASSWORD:            'Contraseña cambiada',
  USUARIO_CREADO:             'Usuario creado',
  USUARIO_ACTIVADO:           'Cuenta activada (invitación aceptada)',
  USUARIO_DESACTIVADO:        'Usuario desactivado',
  ACCESO_DENEGADO:            'Acceso denegado por falta de permisos',
  ROL_CREADO:                 'Rol creado',
  ROL_MODIFICADO:             'Rol modificado',
  ROL_ELIMINADO:              'Rol eliminado',
  ROL_ASIGNADO:               'Rol asignado a un usuario',
  PERMISOS_ASIGNADOS:         'Permisos individuales modificados',
  USUARIO_MODIFICADO:         'Usuario modificado',
  USUARIO_REACTIVADO:         'Usuario reactivado',
  RESET_FORZADO:              'Reseteo de clave enviado',
  PLAN_MODIFICADO:            'Plan de suscripción modificado',
  COTIZACION_APROBADA:        'Cotización aprobada',
  COTIZACION_RECHAZADA:       'Cotización rechazada',
  COTIZACION_CANCELADA:       'Cotización cancelada',
  MARKUP_MODIFICADO:          'Productos y markup de una agencia modificados',
  RESERVA_CREADA:             'Reserva creada',
  PAGO_INFORMADO:             'Pago informado',
  PAGO_CONFIRMADO:            'Pago confirmado',
  PAGO_RECHAZADO:             'Pago rechazado',
  PAGO_DEVUELTO:              'Pago devuelto',
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
  'RESET_PASSWORD', 'CAMBIO_PASSWORD', 'USUARIO_ACTIVADO',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'PLAN_MODIFICADO',
];
const NEGOCIO_ADMIN = [];

// Mayorista: gestiona agencias y aprueba/cobra operaciones.
const SEGURIDAD_MAYORISTA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'RESET_PASSWORD', 'CAMBIO_PASSWORD', 'USUARIO_ACTIVADO',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'USUARIO_MODIFICADO',
  'ROL_CREADO', 'ROL_MODIFICADO', 'ROL_ELIMINADO', 'ROL_ASIGNADO', 'PERMISOS_ASIGNADOS',
  'RESET_FORZADO', 'ACCESO_DENEGADO',
];
const NEGOCIO_MAYORISTA = [
  'COTIZACION_APROBADA', 'COTIZACION_RECHAZADA', 'MARKUP_MODIFICADO',
  'PAGO_CONFIRMADO', 'PAGO_RECHAZADO', 'PAGO_DEVUELTO',
  'RESERVA_CERRADA', 'RESERVA_CANCELADA',
];

// Agencia: cotiza, reserva e informa pagos.
const SEGURIDAD_AGENCIA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'RESET_PASSWORD', 'CAMBIO_PASSWORD', 'USUARIO_ACTIVADO',
];
const NEGOCIO_AGENCIA = [
  'COTIZACION_CANCELADA', 'RESERVA_CREADA', 'PAGO_INFORMADO', 'RESERVA_CANCELADA',
];

export const ACCIONES_POR_ROL = {
  admin:     { seguridad: SEGURIDAD_ADMIN,     negocio: NEGOCIO_ADMIN },
  mayorista: { seguridad: SEGURIDAD_MAYORISTA, negocio: NEGOCIO_MAYORISTA },
  agencia:   { seguridad: SEGURIDAD_AGENCIA,   negocio: NEGOCIO_AGENCIA },
};
