/**
 * Catálogo de piezas de las "consultas armables" del Asistente Inteligente.
 *
 * En lugar de un catálogo cerrado de preguntas, el asistente tiene un catálogo
 * cerrado de piezas (fuentes, métricas, agrupaciones, filtros y períodos) que
 * la IA combina para responder una pregunta. Este módulo define qué piezas
 * existen, cuáles combinan entre sí y qué permiso pide cada una, y valida la
 * combinación antes de que llegue a la base.
 *
 * Es la única puerta de entrada al constructor de consultas: lo que no pasa
 * por validarConsulta() no se ejecuta.
 */

const { PERIODOS_VALIDOS } = require('./queryExecutor');
const { hoyAR } = require('./fechasAR');

const PERMISO_DINERO = 'VerReportes';
const LIMITE_MAX = 20;
const LIMITE_DEFAULT = 10;
const MAX_LARGO_NOMBRE = 60;

const PERIODOS_FUTUROS = ['next_n_days', 'next_week', 'next_month'];

// ─────────────────────────────────────────────
// Piezas
// ─────────────────────────────────────────────

const FUENTES = {
  reservas: {
    etiqueta: 'reservas',
    permiso: 'GestionarReservas',
    modos: ['resumen', 'listado'],
    fechas: ['creacion', 'viaje'],
    estados: ['pendiente_pago', 'pago_informado', 'pagada', 'cerrada', 'cancelada'],
  },
  cotizaciones: {
    etiqueta: 'cotizaciones',
    permiso: 'GestionarCotizaciones',
    modos: ['resumen', 'listado'],
    fechas: ['creacion', 'viaje'],
    estados: ['pendiente', 'aprobada', 'rechazada', 'vencida', 'cancelada', 'reserva_generada'],
  },
  pagos: {
    etiqueta: 'pagos',
    permiso: 'GestionarReservas',
    modos: ['resumen', 'listado'],
    fechas: ['creacion'],
    // Derivados: el modelo Pago no tiene un campo de estado (ver constructor)
    estados: ['por_confirmar', 'confirmado', 'rechazado', 'anulado'],
  },
  agencias: {
    etiqueta: 'agencias',
    permiso: 'GestionarAgencias',
    modos: ['resumen'],
    fechas: ['creacion'],
    estados: [],
  },
  productos: {
    etiqueta: 'productos',
    permiso: 'GestionarProductos',
    modos: ['resumen'],
    fechas: ['creacion'],
    estados: [],
  },
};

/**
 * dinero: true → además del permiso de la fuente pide VerReportes, igual que
 * el módulo de Reportes. Los montos de pagos son la excepción: ya se ven en la
 * sección Reservas con GestionarReservas.
 * soloEntidades: la métrica devuelve una lista de agencias/productos, no se
 * agrupa ni se compara.
 */
const METRICAS = {
  cantidad: {
    etiqueta: 'Cantidad', tipo: 'numero', dinero: false,
    fuentes: ['reservas', 'cotizaciones', 'pagos', 'agencias', 'productos'],
    descripcion: 'cantidad de registros',
  },
  pasajeros: {
    etiqueta: 'Pasajeros', tipo: 'numero', dinero: false,
    fuentes: ['reservas', 'cotizaciones'],
    descripcion: 'suma de pasajeros',
  },
  facturacion: {
    etiqueta: 'Facturación', tipo: 'moneda', dinero: true,
    fuentes: ['reservas'],
    descripcion: 'suma del precio de las reservas no canceladas',
  },
  ingresos_confirmados: {
    etiqueta: 'Ingresos confirmados', tipo: 'moneda', dinero: true,
    fuentes: ['reservas'],
    descripcion: 'suma del precio de las reservas con pago informado, pagadas o cerradas',
  },
  ticket_promedio: {
    etiqueta: 'Ticket promedio', tipo: 'moneda', dinero: true,
    fuentes: ['reservas'],
    descripcion: 'precio promedio por reserva',
  },
  monto_cotizado: {
    etiqueta: 'Monto cotizado', tipo: 'moneda', dinero: true,
    fuentes: ['cotizaciones'],
    descripcion: 'suma del precio cotizado',
  },
  tasa_conversion: {
    etiqueta: 'Conversión', tipo: 'porcentaje', dinero: true,
    fuentes: ['cotizaciones'],
    descripcion: 'porcentaje de cotizaciones ya resueltas que terminaron en reserva',
  },
  monto_pagado: {
    etiqueta: 'Monto pagado', tipo: 'moneda', dinero: false,
    fuentes: ['pagos'],
    descripcion: 'suma de los pagos informados',
  },
  dias_sin_reservar: {
    etiqueta: 'Días sin reservar', tipo: 'numero', dinero: false, soloEntidades: true, sinPeriodo: true,
    fuentes: ['agencias'],
    descripcion: 'días desde la última reserva de cada agencia activa',
  },
  sin_reservas: {
    etiqueta: 'Sin reservas', tipo: 'texto', dinero: false, soloEntidades: true,
    fuentes: ['agencias', 'productos'],
    descripcion: 'agencias o productos activos sin ninguna reserva en el período',
  },
};

const AGRUPACIONES = {
  ninguno:       { etiqueta: null, fuentes: ['reservas', 'cotizaciones', 'pagos', 'agencias', 'productos'] },
  agencia:       { etiqueta: 'Agencia', fuentes: ['reservas', 'cotizaciones', 'pagos'] },
  producto:      { etiqueta: 'Producto', fuentes: ['reservas', 'cotizaciones'] },
  tipo_producto: { etiqueta: 'Tipo de producto', fuentes: ['reservas', 'cotizaciones', 'productos'] },
  estado:        { etiqueta: 'Estado', fuentes: ['reservas', 'cotizaciones', 'pagos'] },
  mes:           { etiqueta: 'Mes', fuentes: ['reservas', 'cotizaciones', 'pagos'] },
  metodo_pago:   { etiqueta: 'Método de pago', fuentes: ['pagos'] },
};

const TIPOS_PRODUCTO = ['hotel', 'actividad', 'paquete'];
const METODOS_PAGO = ['transferencia', 'efectivo', 'cheque', 'mercadopago', 'otro'];

const FILTROS = {
  estado:        { fuentes: ['reservas', 'cotizaciones', 'pagos'] },
  tipo_producto: { fuentes: ['reservas', 'cotizaciones', 'productos'] },
  agencia:       { fuentes: ['reservas', 'cotizaciones', 'pagos'] },
  producto:      { fuentes: ['reservas', 'cotizaciones'] },
  metodo_pago:   { fuentes: ['pagos'] },
};

// ─────────────────────────────────────────────
// Permisos
// ─────────────────────────────────────────────

const tiene = (permisos, codigo) => permisos instanceof Set && permisos.has(codigo);

/** Permisos que exige una combinación fuente + métrica. */
function permisosRequeridos(fuente, metrica) {
  const requeridos = [FUENTES[fuente].permiso];
  if (METRICAS[metrica]?.dinero) requeridos.push(PERMISO_DINERO);
  return requeridos;
}

/** Fuentes y métricas que el usuario puede usar, para mostrárselas a la IA. */
function piezasPermitidas(permisos) {
  const fuentes = Object.keys(FUENTES).filter((f) => tiene(permisos, FUENTES[f].permiso));
  const metricas = Object.keys(METRICAS).filter((m) =>
    METRICAS[m].fuentes.some((f) => fuentes.includes(f))
    && (!METRICAS[m].dinero || tiene(permisos, PERMISO_DINERO)));
  return { fuentes, metricas };
}

// ─────────────────────────────────────────────
// Validación
// ─────────────────────────────────────────────

const esEntero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Filtra una lista quedándose solo con los valores válidos, sin repetir. */
const listaValida = (valor, permitidos) =>
  Array.isArray(valor) ? [...new Set(valor.filter((v) => permitidos.includes(v)))] : [];

function nombreValido(valor) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().slice(0, MAX_LARGO_NOMBRE);
  return limpio.length >= 2 ? limpio : null;
}

/**
 * Normaliza el período. Devuelve null si no hay período o es inválido (se usa
 * el default), o { time_range, ... } con los campos que necesita.
 */
function validarPeriodo(periodo, fecha, now) {
  if (!periodo || typeof periodo !== 'object') return null;
  const tr = periodo.time_range;
  const futuro = PERIODOS_FUTUROS.includes(tr);

  if (!PERIODOS_VALIDOS.includes(tr) && !futuro) return null;
  // Los períodos futuros solo tienen sentido para la fecha de viaje
  if (futuro && fecha !== 'viaje') return null;

  if (tr === 'last_n_days' || tr === 'next_n_days') {
    return esEntero(periodo.days, 1, 730) ? { time_range: tr, days: periodo.days } : null;
  }
  if (tr === 'last_n_months') {
    return esEntero(periodo.months, 1, 60) ? { time_range: tr, months: periodo.months } : null;
  }
  if (tr === 'specific_month') {
    const { y } = hoyAR(now);
    // Para la fecha de viaje se aceptan meses del año próximo
    const maxAnio = fecha === 'viaje' ? y + 1 : y;
    return esEntero(periodo.month, 1, 12) && esEntero(periodo.year, 2000, maxAnio)
      ? { time_range: tr, month: periodo.month, year: periodo.year }
      : null;
  }
  return { time_range: tr };
}

/** Período por defecto: 30 días hacia atrás, o 30 hacia adelante para viajes. */
const periodoDefault = (fecha) => (fecha === 'viaje'
  ? { time_range: 'next_n_days', days: 30 }
  : { time_range: 'last_30_days' });

/**
 * Valida y normaliza la consulta que arma la IA.
 *
 * Todo valor inválido se descarta o vuelve a su default. Lo que invalida la
 * consulta entera (devuelve null) es lo que cambiaría su significado: fuente,
 * métrica o agrupación inexistentes o que no combinan, o falta de permisos.
 *
 * @param {object} json      Lo que devolvió la IA
 * @param {Set<string>} permisos  Permisos efectivos del usuario (req.permisos)
 * @returns {object|null}    Consulta normalizada, o null si no es utilizable
 */
function validarConsulta(json, permisos, now = new Date()) {
  if (!json || typeof json !== 'object') return null;

  const fuente = json.fuente;
  if (!FUENTES[fuente]) return null;
  const defFuente = FUENTES[fuente];

  const modo = defFuente.modos.includes(json.modo) ? json.modo : 'resumen';
  const listado = modo === 'listado';

  // En un listado la métrica y la agrupación no aplican
  const metrica = listado ? 'cantidad' : json.metrica;
  const defMetrica = METRICAS[metrica];
  if (!defMetrica || !defMetrica.fuentes.includes(fuente)) return null;

  let agrupar = listado ? 'ninguno' : (json.agrupar_por ?? 'ninguno');
  if (!AGRUPACIONES[agrupar]?.fuentes.includes(fuente)) return null;
  if (defMetrica.soloEntidades && agrupar !== 'ninguno') return null;
  // Contar agencias no tiene agrupación posible
  if (fuente === 'agencias') agrupar = 'ninguno';

  if (!permisosRequeridos(fuente, metrica).every((p) => tiene(permisos, p))) return null;

  const fecha = defFuente.fechas.includes(json.fecha) ? json.fecha : 'creacion';

  // Filtros: los que no aplican a la fuente se ignoran
  const f = json.filtros && typeof json.filtros === 'object' ? json.filtros : {};
  const aplica = (filtro) => FILTROS[filtro].fuentes.includes(fuente);
  const filtros = {
    estado: aplica('estado') ? listaValida(f.estado, defFuente.estados) : [],
    tipo_producto: aplica('tipo_producto') ? listaValida(f.tipo_producto, TIPOS_PRODUCTO) : [],
    agencia: aplica('agencia') ? nombreValido(f.agencia) : null,
    producto: aplica('producto') ? nombreValido(f.producto) : null,
    metodo_pago: aplica('metodo_pago') ? listaValida(f.metodo_pago, METODOS_PAGO) : [],
  };
  // La conversión se calcula sobre todos los estados: filtrar por uno la vacía
  if (metrica === 'tasa_conversion') filtros.estado = [];

  const periodo = defMetrica.sinPeriodo
    ? null
    : (validarPeriodo(json.periodo, fecha, now) || periodoDefault(fecha));

  // Comparar con el período anterior: solo resúmenes numéricos con un
  // período acotado, y no por mes (la serie ya muestra la evolución)
  const comparar = json.comparar === 'periodo_anterior'
    && !listado && !defMetrica.soloEntidades && agrupar !== 'mes'
    && periodo !== null && periodo.time_range !== 'all_time'
    && fuente !== 'agencias' && fuente !== 'productos';

  const limite = esEntero(json.limite, 1, LIMITE_MAX) ? json.limite : LIMITE_DEFAULT;
  const orden = json.orden === 'asc' ? 'asc' : 'desc';

  return {
    fuente, modo, metrica, agrupar_por: agrupar, filtros, fecha, periodo, comparar, orden, limite,
  };
}

module.exports = {
  FUENTES,
  METRICAS,
  AGRUPACIONES,
  FILTROS,
  TIPOS_PRODUCTO,
  METODOS_PAGO,
  PERIODOS_FUTUROS,
  LIMITE_MAX,
  PERMISO_DINERO,
  permisosRequeridos,
  piezasPermitidas,
  validarConsulta,
};
