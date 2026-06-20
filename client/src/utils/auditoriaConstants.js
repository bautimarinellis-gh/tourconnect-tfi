export const ACCION_LABELS = {
  LOGIN_EXITOSO:              'Inicio de sesión',
  LOGIN_FALLIDO:              'Intento de acceso fallido',
  LOGOUT:                     'Cierre de sesión',
  SET_PASSWORD:               'Contraseña configurada',
  RESET_PASSWORD:             'Contraseña restablecida',
  RESET_PASSWORD_SOLICITADO:  'Solicitud de reset de contraseña',
  USUARIO_CREADO:             'Usuario creado',
  USUARIO_DESACTIVADO:        'Usuario desactivado',
  USUARIO_REACTIVADO:         'Usuario reactivado',
  MAYORISTA_CREADO:           'Mayorista creado',
  MAYORISTA_DESACTIVADO:      'Mayorista desactivado',
  MAYORISTA_ACTUALIZADO:      'Mayorista actualizado',
  AGENCIA_CREADA:             'Agencia creada',
  AGENCIA_DESACTIVADA:        'Agencia desactivada',
  AGENCIA_REACTIVADA:         'Agencia reactivada',
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

// Admin: ve toda la plataforma
const SEGURIDAD_ADMIN = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'SET_PASSWORD', 'RESET_PASSWORD', 'RESET_PASSWORD_SOLICITADO',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO',
  'MAYORISTA_CREADO', 'MAYORISTA_DESACTIVADO',
  'AGENCIA_CREADA', 'AGENCIA_DESACTIVADA', 'AGENCIA_REACTIVADA',
];
const NEGOCIO_ADMIN = [
  'MAYORISTA_ACTUALIZADO',
  'COTIZACION_CREADA', 'COTIZACION_APROBADA', 'COTIZACION_RECHAZADA', 'COTIZACION_CANCELADA',
  'RESERVA_CREADA', 'PAGO_INFORMADO', 'PAGO_CONFIRMADO', 'PAGO_RECHAZADO',
  'RESERVA_CERRADA', 'RESERVA_CANCELADA',
  'MARKUP_ACTUALIZADO', 'PRODUCTOS_AGENCIA_SYNC',
];

// Mayorista: ve su tenant; excluye acciones exclusivas del admin (MAYORISTA_CREADO/DESACTIVADO)
const SEGURIDAD_MAYORISTA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'SET_PASSWORD', 'RESET_PASSWORD', 'RESET_PASSWORD_SOLICITADO',
  'USUARIO_CREADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO',
  'AGENCIA_CREADA', 'AGENCIA_DESACTIVADA', 'AGENCIA_REACTIVADA',
];
const NEGOCIO_MAYORISTA = [
  'MAYORISTA_ACTUALIZADO',
  'COTIZACION_CREADA', 'COTIZACION_APROBADA', 'COTIZACION_RECHAZADA', 'COTIZACION_CANCELADA',
  'RESERVA_CREADA', 'PAGO_INFORMADO', 'PAGO_CONFIRMADO', 'PAGO_RECHAZADO',
  'RESERVA_CERRADA', 'RESERVA_CANCELADA',
  'MARKUP_ACTUALIZADO', 'PRODUCTOS_AGENCIA_SYNC',
];

// Agencia: ve solo sus propias acciones; excluye gestión de usuarios/agencias/mayoristas
const SEGURIDAD_AGENCIA = [
  'LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT',
  'SET_PASSWORD', 'RESET_PASSWORD', 'RESET_PASSWORD_SOLICITADO',
];
const NEGOCIO_AGENCIA = [
  'COTIZACION_CREADA', 'COTIZACION_APROBADA', 'COTIZACION_RECHAZADA', 'COTIZACION_CANCELADA',
  'RESERVA_CREADA', 'PAGO_INFORMADO', 'PAGO_CONFIRMADO', 'PAGO_RECHAZADO',
  'RESERVA_CERRADA', 'RESERVA_CANCELADA',
];

export const ACCIONES_POR_ROL = {
  admin:     { seguridad: SEGURIDAD_ADMIN,     negocio: NEGOCIO_ADMIN },
  mayorista: { seguridad: SEGURIDAD_MAYORISTA, negocio: NEGOCIO_MAYORISTA },
  agencia:   { seguridad: SEGURIDAD_AGENCIA,   negocio: NEGOCIO_AGENCIA },
};
