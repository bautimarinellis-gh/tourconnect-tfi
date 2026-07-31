export const ACCION_LABELS = {
  LOGIN_EXITOSO:              'Inicio de sesión',
  LOGIN_FALLIDO:              'Intento de acceso fallido',
  LOGOUT:                     'Cierre de sesión',
  SET_PASSWORD:               'Contraseña configurada',
  RESET_PASSWORD:             'Contraseña restablecida',
  RESET_PASSWORD_SOLICITADO:  'Solicitud de reset de contraseña',
  RESET_CODE_FALLIDO:         'Código de verificación incorrecto',
  USUARIO_CREADO:             'Usuario creado',
  USUARIO_DESACTIVADO:        'Usuario desactivado',
  USUARIO_REACTIVADO:         'Usuario reactivado',
  ACTIVACION_MANUAL_USUARIO:  'Activación manual de usuario',
  CAMBIO_PASSWORD:            'Contraseña cambiada',
  MAYORISTA_CREADO:           'Mayorista creado',
  MAYORISTA_DESACTIVADO:      'Mayorista desactivado',
  MAYORISTA_REACTIVADO:       'Mayorista reactivado',
  MAYORISTA_ACTUALIZADO:      'Mayorista actualizado',
  AGENCIA_CREADA:             'Agencia creada',
  AGENCIA_DESACTIVADA:        'Agencia desactivada',
  AGENCIA_REACTIVADA:         'Agencia reactivada',
  AGENCIA_ACTUALIZADA:        'Agencia actualizada',
  REPORTE_EXPORTADO:          'Reporte exportado',
  COTIZACION_CREADA:          'Cotización creada',
  COTIZACION_APROBADA:        'Cotización aprobada',
  COTIZACION_RECHAZADA:       'Cotización rechazada',
  COTIZACION_CANCELADA:       'Cotización cancelada',
  RESERVA_CREADA:             'Reserva creada',
  PAGO_INFORMADO:             'Pago informado',
  PAGO_CONFIRMADO:            'Pago confirmado',
  PAGO_RECHAZADO:             'Pago rechazado',
  RESERVA_CERRADA:            'Reserva cerrada',
  RESERVA_CANCELADA:          'Reserva cancelada',
  MARKUP_ACTUALIZADO:         'Markup actualizado',
  PRODUCTOS_AGENCIA_SYNC:     'Sincronización de productos',
};

// Scoping "mi actividad": cada rol ve solo sus propias acciones, así que
// el filtro ofrece únicamente las acciones que ese rol ejecuta como actor.
// (Verificado contra los role() de las rutas y los registrarAuditoria de
// cada controller.)

// Admin: gestiona mayoristas; su cuenta nace del seed (nunca SET_PASSWORD).
const SEGURIDAD_ADMIN = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'RESET_PASSWORD', 'RESET_PASSWORD_SOLICITADO', 'RESET_CODE_FALLIDO', 'CAMBIO_PASSWORD',
  'USUARIO_CREADO', 'ACTIVACION_MANUAL_USUARIO',
  'MAYORISTA_CREADO', 'MAYORISTA_DESACTIVADO', 'MAYORISTA_REACTIVADO',
];
const NEGOCIO_ADMIN = [
  'MAYORISTA_ACTUALIZADO',
];

// Mayorista: gestiona agencias y aprueba/cobra operaciones.
const SEGURIDAD_MAYORISTA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'SET_PASSWORD', 'RESET_PASSWORD', 'RESET_PASSWORD_SOLICITADO', 'RESET_CODE_FALLIDO', 'CAMBIO_PASSWORD',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO',
  'AGENCIA_CREADA', 'AGENCIA_DESACTIVADA', 'AGENCIA_REACTIVADA',
];
const NEGOCIO_MAYORISTA = [
  'MAYORISTA_ACTUALIZADO', 'AGENCIA_ACTUALIZADA', 'REPORTE_EXPORTADO',
  'COTIZACION_APROBADA', 'COTIZACION_RECHAZADA',
  'PAGO_CONFIRMADO', 'PAGO_RECHAZADO',
  'RESERVA_CERRADA', 'RESERVA_CANCELADA',
  'MARKUP_ACTUALIZADO', 'PRODUCTOS_AGENCIA_SYNC',
];

// Agencia: cotiza, reserva e informa pagos.
const SEGURIDAD_AGENCIA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'SET_PASSWORD', 'RESET_PASSWORD', 'RESET_PASSWORD_SOLICITADO', 'RESET_CODE_FALLIDO', 'CAMBIO_PASSWORD',
];
const NEGOCIO_AGENCIA = [
  'COTIZACION_CREADA', 'COTIZACION_CANCELADA',
  'RESERVA_CREADA', 'PAGO_INFORMADO', 'RESERVA_CANCELADA',
];

export const ACCIONES_POR_ROL = {
  admin:     { seguridad: SEGURIDAD_ADMIN,     negocio: NEGOCIO_ADMIN },
  mayorista: { seguridad: SEGURIDAD_MAYORISTA, negocio: NEGOCIO_MAYORISTA },
  agencia:   { seguridad: SEGURIDAD_AGENCIA,   negocio: NEGOCIO_AGENCIA },
};
