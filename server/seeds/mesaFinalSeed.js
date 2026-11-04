/**
 * Base de datos completa para la demo de la mesa final.
 *
 * Arma desde cero una base con un año de operación de un mayorista:
 *  - 3 usuarios con acceso: el admin de la plataforma (ADMIN_EMAIL /
 *    ADMIN_PASSWORD del .env), el mayorista y una agencia (las credenciales
 *    de seeds/demoSeed.js);
 *  - 6 agencias más del mismo mayorista, cada una con su usuario sin
 *    contraseña: no pueden iniciar sesión, solo aportan historia para los
 *    reportes y el asistente;
 *  - catálogo de hoteles, actividades y paquetes con márgenes por agencia;
 *  - cotizaciones en todos sus estados, reservas con su historial, pagos
 *    manuales y con Mercado Pago (de prueba), rechazos y devoluciones;
 *  - grupos de seguridad y registro de auditoría (logins y operaciones).
 *
 * BORRA TODA LA BASE antes de cargar, así que solo corre si el MONGO_URI
 * apunta a la base `tourconnect_mesa`.
 *
 * Es determinístico (semilla fija) y las fechas son relativas al día en que
 * se corre: conviene correrlo el día antes de la mesa, porque las
 * cotizaciones pendientes y aprobadas vencen solas a las 72 hs.
 *
 * Uso: node seeds/mesaFinalSeed.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: require('path').resolve(__dirname, '..', '..', '.env'), quiet: true });

const Usuario = require('../models/Usuario');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
const Producto = require('../models/Producto');
const AgenciaProducto = require('../models/AgenciaProducto');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const Pago = require('../models/Pago');
const IntentoPago = require('../models/IntentoPago');
const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');
const HistorialEstadoPersona = require('../models/HistorialEstadoPersona');
const AuditLog = require('../models/AuditLog');
const Rol = require('../models/Rol');
const Permiso = require('../models/Permiso');
const { bootstrapSeguridad } = require('../utils/bootstrapSeguridad');
const { ROL_ADMINISTRADOR } = require('../utils/permisosCatalogo');
const { calcularPrecioCotizacion } = require('../utils/precioCalculator');

const BASE_PERMITIDA = 'tourconnect_mesa';

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;
const MESES_HISTORIA = 12;
const TIPO_CAMBIO = Number(process.env.MP_TIPO_CAMBIO_ARS) || 1450;

// ─────────────────────────────────────────────
// Datos de la demo
// ─────────────────────────────────────────────

const MAYORISTA = {
  email: 'mayorista@gmail.com',
  password: 'Mayorista123@',
  nombre: 'Paraná Mayorista de Turismo',
  razon_social: 'Paraná Mayorista de Turismo S.A.',
  cuit: '30-71500001-4',
  telefono: '341 4250000',
  plan: 'Professional',
};

// peso: cuánto opera; cancela: probabilidad de cancelar; hastaHaceDias: deja
// de operar hace N días (agencia inactiva); desactivada: dada de baja.
const AGENCIAS = [
  { nombre: 'Rosario Viajes', razon: 'Rosario Viajes S.R.L.', email: 'agencia@gmail.com', password: 'Agencia123@', peso: 32, cancela: 0.08, sinMendoza: true },
  { nombre: 'Viajes del Sur', razon: 'Viajes del Sur S.R.L.', peso: 26, cancela: 0.1 },
  { nombre: 'Norte Turismo', razon: 'Norte Turismo S.A.', peso: 18, cancela: 0.3 },
  { nombre: 'Andes Travel', razon: 'Andes Travel S.R.L.', peso: 14, cancela: 0.1 },
  { nombre: 'Patagonia Express', razon: 'Patagonia Express S.A.', peso: 10, cancela: 0.12 },
  { nombre: 'Litoral Viajes', razon: 'Litoral Viajes S.R.L.', peso: 9, cancela: 0.1, hastaHaceDias: 80 },
  { nombre: 'Cuyo Destinos', razon: 'Cuyo Destinos S.A.', peso: 0, cancela: 0, desactivada: true },
];

const PRODUCTOS = [
  { tipo: 'hotel', nombre: 'Hotel Costa del Lago', precio: 165, descripcion: 'Hotel frente al lago Nahuel Huapi, con desayuno y spa.', extra: { direccion: 'Av. Bustillo km 18, San Carlos de Bariloche', estrellas: 5, cupo_maximo: 40 } },
  { tipo: 'hotel', nombre: 'Hotel Selva Misionera', precio: 115, descripcion: 'Hotel a 10 minutos de las Cataratas del Iguazú, con traslados incluidos.', extra: { direccion: 'Ruta 12 km 5, Puerto Iguazú', estrellas: 4, cupo_maximo: 50 } },
  { tipo: 'hotel', nombre: 'Hotel Puerto Norte', precio: 95, descripcion: 'Hotel urbano en la costa de Rosario, ideal para viajes de negocios.', extra: { direccion: 'Av. Francia 500, Rosario', estrellas: 4, cupo_maximo: 40 } },
  // Nunca se reservó: para "¿qué productos no tuvieron reservas?"
  { tipo: 'hotel', nombre: 'Hotel Termal del Norte', precio: 85, descripcion: 'Hotel con piscinas termales en Termas de Río Hondo.', extra: { direccion: 'Av. San Martín 300, Termas de Río Hondo', estrellas: 3, cupo_maximo: 30 }, nunca: true },
  { tipo: 'actividad', nombre: 'Excursión Glaciar Perito Moreno', precio: 95, descripcion: 'Día completo con pasarelas y navegación frente al glaciar.', extra: { cupo_maximo: 40, duracion_horas: 8 } },
  { tipo: 'actividad', nombre: 'Navegación por el Canal Beagle', precio: 75, descripcion: 'Navegación de medio día hasta el faro Les Eclaireurs.', extra: { cupo_maximo: 30, duracion_horas: 4 } },
  { tipo: 'actividad', nombre: 'Rafting en el río Mendoza', precio: 60, descripcion: 'Bajada de rafting de dificultad media, con equipo incluido.', extra: { cupo_maximo: 20, duracion_horas: 3 } },
  // Disponibilidad vencida: las agencias ya no lo ven; el mayorista sí, como "Vencido".
  { tipo: 'actividad', nombre: 'Avistaje de ballenas en Puerto Madryn', precio: 70, descripcion: 'Salida embarcada en temporada de ballena franca austral.', extra: { cupo_maximo: 25, duracion_horas: 3 }, nunca: true, vencido: true },
  { tipo: 'paquete', nombre: 'Paquete Salta y Jujuy', precio: 650, dias: 5, descripcion: 'Aéreo, hotel y excursiones por la Quebrada de Humahuaca.', extra: { itinerario: '5 días: Salta, Cafayate, Purmamarca y Humahuaca.', cupo_maximo: 30 } },
  { tipo: 'paquete', nombre: 'Paquete Ushuaia Fin del Mundo', precio: 890, dias: 6, descripcion: 'Aéreo, hotel y excursiones en Tierra del Fuego.', extra: { itinerario: '6 días: Ushuaia, Tren del Fin del Mundo, Canal Beagle y Parque Nacional.', cupo_maximo: 30 } },
  { tipo: 'paquete', nombre: 'Paquete Mendoza Caminos del Vino', precio: 540, dias: 4, descripcion: 'Hotel, bodegas y alta montaña.', extra: { itinerario: '4 días: Mendoza, Luján de Cuyo, Valle de Uco y Potrerillos.', cupo_maximo: 25 } },
];

const METODOS_MANUALES = ['transferencia', 'transferencia', 'transferencia', 'efectivo', 'cheque'];
const MOTIVOS_RECHAZO = [
  'Sin disponibilidad en las fechas pedidas.',
  'Tarifa no vigente para esa temporada.',
  'El grupo supera el cupo disponible para esa salida.',
];
const MOTIVOS_CANCELACION = [
  'El pasajero desistió del viaje.',
  'Cambio de fechas: se vuelve a cotizar.',
  'El pasajero no consiguió los días de licencia.',
];
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
];
// Rangos de documentación (RFC 5737): no son direcciones de nadie.
const ipDemo = (n) => `203.0.113.${(n % 250) + 1}`;

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────

/** Generador pseudoaleatorio con semilla (mulberry32): corridas reproducibles. */
function crearAzar(semilla) {
  let a = semilla;
  const rnd = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    rnd,
    entero: (min, max) => Math.floor(rnd() * (max - min + 1)) + min,
    elegir: (lista) => lista[Math.floor(rnd() * lista.length)],
    ponderado: (lista) => {
      const total = lista.reduce((s, x) => s + x.peso, 0);
      let r = rnd() * total;
      for (const x of lista) { r -= x.peso; if (r <= 0) return x; }
      return lista[lista.length - 1];
    },
  };
}

/** Fecha de calendario (medianoche UTC) a N días de un instante, en hora argentina. */
function diaCalendario(instante, dias) {
  const ar = new Date(instante.getTime() - 3 * HORA);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + dias));
}

const dec = (n) => mongoose.Types.Decimal128.fromString(Number(n).toFixed(2));

/** Guarda respetando las fechas del documento (sin pisar created_at). */
async function guardar(Model, datos) {
  const doc = new Model(datos);
  await doc.save({ timestamps: false });
  return doc;
}

// ─────────────────────────────────────────────
// Carga
// ─────────────────────────────────────────────

async function cargar() {
  const azar = crearAzar(20261112);
  const ahora = new Date();
  const hoy = diaCalendario(ahora, 0);
  const inicioDeMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1) + 3 * HORA);
  const cuenta = { cotizaciones: 0, reservas: 0, pagos: 0, auditoria: 0 };
  let nroEvento = 0;

  const auditar = (datos) => {
    nroEvento++;
    cuenta.auditoria++;
    return guardar(AuditLog, {
      resultado: 'exitoso',
      ip_address: datos.usuario_id ? ipDemo(nroEvento) : null,
      user_agent: datos.usuario_id ? USER_AGENTS[nroEvento % USER_AGENTS.length] : null,
      ...datos,
    });
  };

  // 1. Seguridad: permisos y rol Administrador (lo mismo que al levantar el server)
  await bootstrapSeguridad();
  const rolAdministrador = await Rol.findOne({ nombre: ROL_ADMINISTRADOR, mayorista_id: null }).select('_id');

  // 2. Admin de la plataforma
  const admin = await Usuario.create({
    email: process.env.ADMIN_EMAIL,
    password_hash: await Usuario.hashPassword(process.env.ADMIN_PASSWORD),
    rol: 'admin',
    nombre: 'Administrador TourConnect',
    activo: true,
  });

  // 3. Mayorista
  const alta = new Date(ahora.getTime() - (MESES_HISTORIA * 30 + 20) * DIA);
  const usuarioMayorista = await Usuario.create({
    email: MAYORISTA.email,
    password_hash: await Usuario.hashPassword(MAYORISTA.password),
    rol: 'mayorista',
    nombre: 'Lucía Fernández',
    rol_id: rolAdministrador._id,
    activo: true,
  });
  const mayorista = await Mayorista.create({
    usuario_id: usuarioMayorista._id,
    nombre: MAYORISTA.nombre,
    razon_social: MAYORISTA.razon_social,
    cuit: MAYORISTA.cuit,
    telefono: MAYORISTA.telefono,
    plan_suscripcion: MAYORISTA.plan,
    activo: true,
  });
  usuarioMayorista.mayorista_id = mayorista._id;
  await usuarioMayorista.save();
  const mayoristaId = mayorista._id;

  await auditar({ usuario_id: admin._id, accion: 'USUARIO_CREADO', categoria: 'seguridad', entidad_afectada: 'Usuario', entidad_id: usuarioMayorista._id, detalle: { email: MAYORISTA.email, rol: 'mayorista' }, timestamp: alta });
  await auditar({ usuario_id: admin._id, accion: 'PLAN_MODIFICADO', categoria: 'seguridad', entidad_afectada: 'Mayorista', entidad_id: mayoristaId, detalle: { antes: 'Starter', despues: MAYORISTA.plan }, timestamp: new Date(ahora.getTime() - 120 * DIA) });

  // 4. Grupos de seguridad propios del mayorista (sin usuarios asignados todavía)
  const permisos = new Map((await Permiso.find().lean()).map((p) => [p.codigo, p._id]));
  const GRUPOS = [
    { nombre: 'Finanzas', permisos: ['GestionarReservas', 'VerReportes'] },
    { nombre: 'Operaciones', permisos: ['GestionarCotizaciones', 'GestionarReservas', 'GestionarProductos'] },
    { nombre: 'Comercial', permisos: ['GestionarAgencias', 'GestionarCotizaciones', 'VerReportes'] },
  ];
  for (const [i, g] of GRUPOS.entries()) {
    const rol = await guardar(Rol, {
      nombre: g.nombre, ambito: 'Mayorista', personalizado: true, protegido: false, mayorista_id: mayoristaId,
      permisos: g.permisos.map((c) => permisos.get(c)),
      created_at: new Date(alta.getTime() + (i + 3) * DIA), updated_at: new Date(alta.getTime() + (i + 3) * DIA),
    });
    await auditar({ usuario_id: usuarioMayorista._id, mayorista_id: mayoristaId, accion: 'ROL_CREADO', categoria: 'seguridad', entidad_afectada: 'Rol', entidad_id: rol._id, detalle: { nombre: g.nombre, permisos: g.permisos }, timestamp: rol.created_at });
  }

  // 5. Agencias (solo la primera puede iniciar sesión)
  const agencias = [];
  for (const [i, def] of AGENCIAS.entries()) {
    const creada = new Date(alta.getTime() + (5 + i * 9) * DIA);
    const usuario = await guardar(Usuario, {
      email: def.email || `${def.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.')}@agencias.test`,
      password_hash: def.password ? await Usuario.hashPassword(def.password) : undefined,
      rol: 'agencia', nombre: def.nombre, activo: !def.desactivada,
      created_at: creada, updated_at: creada,
    });
    const agencia = await guardar(Agencia, {
      usuario_id: usuario._id, mayorista_id: mayoristaId, nombre: def.nombre,
      razon_social: def.razon, cuit: `30-7150${String(i + 10).padStart(4, '0')}-${(i * 3) % 10}`,
      telefono: `341 4${String(300000 + i * 1111)}`, activo: !def.desactivada,
      ...(def.desactivada && {
        motivo_desactivacion: 'inactividad',
        motivo_desactivacion_mensaje: 'No registró operaciones desde su alta.',
        fecha_desactivacion: new Date(ahora.getTime() - 40 * DIA),
      }),
      created_at: creada, updated_at: creada,
    });
    await auditar({ usuario_id: usuarioMayorista._id, mayorista_id: mayoristaId, accion: 'USUARIO_CREADO', categoria: 'seguridad', entidad_afectada: 'Usuario', entidad_id: usuario._id, detalle: { email: usuario.email, rol: 'agencia', con_invitacion: true }, timestamp: creada });
    if (def.desactivada) {
      const baja = new Date(ahora.getTime() - 40 * DIA);
      await guardar(HistorialEstadoPersona, {
        persona_id: agencia._id, persona_tipo: 'Agencia', usuario_id: usuarioMayorista._id,
        estado_anterior: true, estado_nuevo: false, motivo: 'inactividad',
        motivo_mensaje: 'No registró operaciones desde su alta.', created_at: baja,
      });
      await auditar({ usuario_id: usuarioMayorista._id, mayorista_id: mayoristaId, accion: 'USUARIO_DESACTIVADO', categoria: 'seguridad', entidad_afectada: 'Usuario', entidad_id: usuario._id, detalle: { motivo: 'inactividad' }, timestamp: baja });
    }
    agencias.push({ ...def, _id: agencia._id, usuarioId: usuario._id, creada });
  }
  const agenciaConAcceso = agencias[0];

  // 6. Productos
  const productos = [];
  for (const def of PRODUCTOS) {
    const creado = new Date(alta.getTime() + 2 * DIA);
    const producto = await guardar(Producto, {
      mayorista_id: mayoristaId, tipo: def.tipo, nombre: def.nombre, descripcion: def.descripcion,
      precio_base: def.precio,
      disponibilidad_desde: def.vencido ? new Date(ahora.getTime() - 220 * DIA) : diaCalendario(alta, 0),
      disponibilidad_hasta: def.vencido ? new Date(ahora.getTime() - 15 * DIA) : diaCalendario(ahora, 420),
      activo: true, ...def.extra, created_at: creado, updated_at: creado,
    });
    productos.push({ ...def, _id: producto._id });
  }

  // 7. Catálogo de cada agencia, con su margen
  const markups = new Map();
  for (const a of agencias) {
    for (const p of productos) {
      if (a.sinMendoza && p.nombre.includes('Mendoza Caminos')) continue;
      const markup = azar.entero(8, 20);
      markups.set(`${a._id}|${p._id}`, markup);
      await AgenciaProducto.create({ agencia_id: a._id, producto_id: p._id, markup_porcentaje: markup });
    }
  }
  const productoParaAgencia = (a, lista) => {
    const posibles = lista.filter((p) => markups.has(`${a._id}|${p._id}`));
    return azar.elegir(posibles);
  };
  // Un cambio de margen, para la auditoría
  await auditar({
    usuario_id: usuarioMayorista._id, mayorista_id: mayoristaId, accion: 'MARKUP_MODIFICADO', categoria: 'negocio',
    entidad_afectada: 'AgenciaProducto', entidad_id: agenciaConAcceso._id,
    detalle: { agencia: agenciaConAcceso.nombre, producto: productos[0].nombre, antes: 10, despues: markups.get(`${agenciaConAcceso._id}|${productos[0]._id}`) },
    timestamp: new Date(ahora.getTime() - 25 * DIA),
  });

  const operan = agencias.filter((a) => !a.desactivada);
  const vendibles = productos.filter((p) => !p.nunca);

  // ─── Una operación: cotización y, si corresponde, reserva, pagos e historial ───
  async function operacion({ creada, agencia, producto, estadoCot, estadoReserva, pago, anticipacion, pasajeros }) {
    const pax = pasajeros || azar.entero(1, 5);
    const fechaInicio = diaCalendario(creada, anticipacion);
    const duracion = producto.tipo === 'hotel' ? azar.entero(2, 6) : producto.tipo === 'paquete' ? producto.dias - 1 : 0;
    const fechaFin = new Date(fechaInicio.getTime() + duracion * DIA);
    // Un viaje que ya terminó se cierra solo: no puede quedar como pagada.
    if (estadoReserva === 'pagada' && fechaFin < hoy) estadoReserva = 'cerrada';
    const markup = markups.get(`${agencia._id}|${producto._id}`);
    const { precio_unitario, unidades, precio_total } = calcularPrecioCotizacion({
      tipo: producto.tipo, precio_base: producto.precio, markup_porcentaje: markup,
      fecha_inicio: fechaInicio, fecha_fin: fechaFin, pasajeros: pax,
    });
    const aprobada = new Date(creada.getTime() + azar.entero(2, 20) * HORA);
    const respondida = ['aprobada', 'reserva_generada', 'rechazada'].includes(estadoCot);

    const cot = await guardar(Cotizacion, {
      agencia_id: agencia._id, producto_id: producto._id, mayorista_id: mayoristaId,
      pasajeros: pax, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      precio_total: dec(precio_total), tipo_producto: producto.tipo, precio_unitario: dec(precio_unitario),
      markup_porcentaje: markup, unidades, estado: estadoCot,
      aprobada_at: ['aprobada', 'reserva_generada'].includes(estadoCot) ? aprobada : null,
      motivo_rechazo: estadoCot === 'rechazada' ? azar.elegir(MOTIVOS_RECHAZO) : undefined,
      motivo_cancelacion: estadoCot === 'cancelada' ? 'La agencia retiró la cotización.' : null,
      created_at: creada, updated_at: respondida ? aprobada : creada,
    });
    cuenta.cotizaciones++;

    const deAgencia = { usuario_id: agencia.usuarioId, mayorista_id: mayoristaId, agencia_id: agencia._id };
    const deMayorista = { usuario_id: usuarioMayorista._id, mayorista_id: mayoristaId, agencia_id: agencia._id };
    if (['aprobada', 'reserva_generada'].includes(estadoCot)) {
      await auditar({ ...deMayorista, accion: 'COTIZACION_APROBADA', categoria: 'negocio', entidad_afectada: 'Cotizacion', entidad_id: cot._id, timestamp: aprobada });
    } else if (estadoCot === 'rechazada') {
      await auditar({ ...deMayorista, accion: 'COTIZACION_RECHAZADA', categoria: 'negocio', entidad_afectada: 'Cotizacion', entidad_id: cot._id, detalle: { motivo_rechazo: cot.motivo_rechazo }, timestamp: aprobada });
    } else if (estadoCot === 'cancelada') {
      await auditar({ ...deAgencia, accion: 'COTIZACION_CANCELADA', categoria: 'negocio', entidad_afectada: 'Cotizacion', entidad_id: cot._id, timestamp: new Date(creada.getTime() + 3 * HORA) });
    }
    if (estadoCot !== 'reserva_generada') return;

    // Reserva
    const reservada = new Date(aprobada.getTime() + azar.entero(2, 30) * HORA);
    const reserva = await guardar(Reserva, {
      cotizacion_id: cot._id, mayorista_id: mayoristaId, agencia_id: agencia._id, estado: estadoReserva,
      motivo_cancelacion: estadoReserva === 'cancelada' ? azar.elegir(MOTIVOS_CANCELACION) : undefined,
      created_at: reservada, updated_at: reservada,
    });
    cuenta.reservas++;
    const historial = (estado_anterior, estado_nuevo, usuario_id, comentario, created_at) =>
      guardar(HistorialEstadoReserva, { reserva_id: reserva._id, usuario_id, estado_anterior, estado_nuevo, comentario, created_at });
    const evento = (quien, accion, timestamp, detalle) =>
      auditar({ ...quien, accion, categoria: 'negocio', entidad_afectada: 'Reserva', entidad_id: reserva._id, detalle, timestamp });

    await historial(null, 'pendiente_pago', agencia.usuarioId, 'Reserva creada a partir de la cotización aprobada.', reservada);
    await evento(deAgencia, 'RESERVA_CREADA', reservada, { cotizacion_id: cot._id });

    // Pagos
    const informado = new Date(reservada.getTime() + azar.entero(1, 4) * DIA);
    const confirmado = new Date(informado.getTime() + azar.entero(3, 30) * HORA);
    const nuevoPago = (extra) => {
      cuenta.pagos++;
      return guardar(Pago, {
        reserva_id: reserva._id, registrado_por: agencia.usuarioId, monto: dec(precio_total),
        metodo: azar.elegir(METODOS_MANUALES), comprobante: `TRF-${String(100000 + cuenta.pagos * 37)}`,
        fecha_pago: diaCalendario(informado, 0), origen: 'manual', created_at: informado, ...extra,
      });
    };
    const informar = async (extra) => {
      const p = await nuevoPago(extra);
      await historial('pendiente_pago', 'pago_informado', agencia.usuarioId, 'La agencia informó un pago.', informado);
      await evento(deAgencia, 'PAGO_INFORMADO', informado, { monto: precio_total, metodo: p.metodo, fecha_pago: p.fecha_pago });
      return p;
    };

    // Un pago rechazado previo (el comprobante no coincidía)
    if (pago === 'rechazado') {
      const p = await informar({ rechazado: true, motivo_rechazo: 'El comprobante no coincide con el monto.', rechazado_at: confirmado });
      await historial('pago_informado', 'pendiente_pago', usuarioMayorista._id, 'Pago rechazado: el comprobante no coincide con el monto.', confirmado);
      await evento(deMayorista, 'PAGO_RECHAZADO', confirmado, { monto: precio_total, motivo_rechazo: p.motivo_rechazo });
      if (estadoReserva === 'pendiente_pago') return;
    }

    const conPasarela = pago === 'mercadopago';
    if (estadoReserva === 'pendiente_pago') return;

    if (estadoReserva === 'cancelada') {
      // Algunas se cancelan con el pago ya confirmado: se registra la devolución.
      const cancelada = new Date(reservada.getTime() + azar.entero(3, 15) * DIA);
      const conPago = azar.rnd() < 0.5 && cancelada > confirmado;
      let anterior = 'pendiente_pago';
      if (conPago) {
        await informar({ devuelto: true, devolucion: { origen: 'manual', metodo: 'transferencia', comprobante: `DEV-${cuenta.pagos}`, fecha: cancelada, registrado_por: usuarioMayorista._id } });
        await historial('pago_informado', 'pagada', usuarioMayorista._id, 'Pago confirmado.', confirmado);
        await evento(deMayorista, 'PAGO_CONFIRMADO', confirmado, { monto: precio_total });
        anterior = 'pagada';
      }
      await historial(anterior, 'cancelada', agencia.usuarioId, reserva.motivo_cancelacion, cancelada);
      await evento(deAgencia, 'RESERVA_CANCELADA', cancelada, { motivo_cancelacion: reserva.motivo_cancelacion });
      if (conPago) await evento(deMayorista, 'PAGO_DEVUELTO', cancelada, { monto: precio_total, metodo: 'transferencia' });
      return;
    }

    if (conPasarela) {
      // Pago con Mercado Pago (modo prueba): lo acredita la pasarela, nadie lo confirma.
      const paymentId = String(90000000000 + cuenta.pagos * 7919);
      const preferenceId = `demo-pref-${cuenta.pagos + 1}`;
      await guardar(IntentoPago, {
        reserva_id: reserva._id, mayorista_id: mayoristaId, agencia_id: agencia._id, iniciado_por: agencia.usuarioId,
        proveedor: 'mercadopago', preference_id: preferenceId, monto_usd: dec(precio_total), tipo_cambio: TIPO_CAMBIO,
        monto_ars: Math.round(precio_total * TIPO_CAMBIO), estado: 'aprobado', payment_id: paymentId, status_detail: 'accredited',
        created_at: informado, updated_at: informado,
      });
      await nuevoPago({
        metodo: 'mercadopago', comprobante: paymentId, origen: 'pasarela',
        pasarela: { proveedor: 'mercadopago', payment_id: paymentId, preference_id: preferenceId, status: 'approved', status_detail: 'accredited', medio: 'visa', monto_ars: Math.round(precio_total * TIPO_CAMBIO), tipo_cambio: TIPO_CAMBIO },
      });
      await historial('pendiente_pago', 'pagada', null, 'Pago acreditado por Mercado Pago.', informado);
      await evento({ usuario_id: null, mayorista_id: mayoristaId, agencia_id: agencia._id }, 'PAGO_CONFIRMADO', informado, { monto: precio_total, origen: 'pasarela', payment_id: paymentId });
    } else {
      await informar({});
      if (estadoReserva === 'pago_informado') return;
      await historial('pago_informado', 'pagada', usuarioMayorista._id, 'Pago confirmado.', confirmado);
      await evento(deMayorista, 'PAGO_CONFIRMADO', confirmado, { monto: precio_total });
    }

    if (estadoReserva === 'cerrada') {
      const cierre = new Date(fechaFin.getTime() + DIA + 3 * HORA);
      await historial('pagada', 'cerrada', null, 'Cierre automático: el viaje finalizó.', cierre);
      await evento({ usuario_id: null, mayorista_id: mayoristaId, agencia_id: agencia._id }, 'RESERVA_CERRADA', cierre);
    }
  }

  // 8. Historia: más movimiento hacia el presente y en temporada alta (enero y julio)
  for (let hace = MESES_HISTORIA; hace >= 1; hace--) {
    const mes = new Date(ahora.getTime() - hace * 30 * DIA).getUTCMonth();
    const temporada = [0, 1, 6].includes(mes) ? 6 : 0;
    const cantidad = 6 + (MESES_HISTORIA - hace) + temporada;
    for (let n = 0; n < cantidad; n++) {
      const diasAtras = hace * 30 - azar.entero(0, 29);
      if (diasAtras < 6) continue;
      const creada = new Date(ahora.getTime() - diasAtras * DIA - azar.entero(0, 10) * HORA);
      const disponibles = operan.filter((a) => (!a.hastaHaceDias || diasAtras > a.hastaHaceDias) && a.creada < creada);
      const agencia = azar.ponderado(disponibles);
      const producto = productoParaAgencia(agencia, vendibles);
      const anticipacion = azar.entero(10, 60);
      const inicio = diaCalendario(creada, anticipacion);

      const r = azar.rnd();
      let estadoCot = 'reserva_generada';
      if (r < 0.12) estadoCot = 'rechazada';
      else if (r < 0.2) estadoCot = 'vencida';
      else if (r < 0.25) estadoCot = 'cancelada';

      // Estado de la reserva coherente con los procesos automáticos: un viaje
      // que ya empezó no puede quedar pendiente de pago ni con un pago sin revisar.
      let estadoReserva;
      let pago = azar.rnd() < 0.2 ? 'mercadopago' : null;
      if (azar.rnd() < agencia.cancela) { estadoReserva = 'cancelada'; pago = null; }
      else if (inicio <= hoy) estadoReserva = 'cerrada';
      else {
        const s = azar.rnd();
        estadoReserva = s < 0.25 ? 'pendiente_pago' : s < 0.45 ? 'pago_informado' : 'pagada';
        if (estadoReserva !== 'pagada') pago = null;
        if (estadoReserva === 'pendiente_pago' && azar.rnd() < 0.35) pago = 'rechazado';
      }
      // Un viaje que todavía no terminó no puede estar cerrado.
      const fin = new Date(inicio.getTime() + (producto.tipo === 'paquete' ? (producto.dias - 1) * DIA : 6 * DIA));
      if (estadoReserva === 'cerrada' && fin >= hoy) estadoReserva = 'pagada';
      await operacion({ creada, agencia, producto, estadoCot, estadoReserva, pago, anticipacion });
    }
  }

  // 9. Movimiento del mes en curso (para "Ingresos del mes" del panel)
  const diasDelMes = Math.max(1, Math.floor((ahora - inicioDeMes) / DIA));
  for (let n = 0; n < 5; n++) {
    const creada = new Date(Math.max(inicioDeMes.getTime() + 2 * HORA, ahora.getTime() - azar.entero(1, diasDelMes) * DIA - 30 * HORA));
    const agencia = n < 2 ? agenciaConAcceso : azar.ponderado(operan.filter((a) => !a.hastaHaceDias));
    await operacion({
      creada, agencia, producto: productoParaAgencia(agencia, vendibles), estadoCot: 'reserva_generada',
      estadoReserva: ['pagada', 'pago_informado', 'pagada', 'pago_informado', 'pagada'][n],
      pago: n === 2 ? 'mercadopago' : null, anticipacion: azar.entero(20, 50),
    });
  }

  // 10. Lo que la demo necesita en vivo
  const recientes = operan.filter((a) => !a.hastaHaceDias);
  // Reservas de la agencia con acceso pendientes de pago (para informar un pago o pagar con Mercado Pago)
  for (let n = 0; n < 2; n++) {
    const creada = new Date(ahora.getTime() - azar.entero(4, 10) * DIA);
    await operacion({ creada, agencia: agenciaConAcceso, producto: productoParaAgencia(agenciaConAcceso, vendibles), estadoCot: 'reserva_generada', estadoReserva: 'pendiente_pago', pago: n === 1 ? 'rechazado' : null, anticipacion: azar.entero(25, 50) });
  }
  // Cotizaciones aprobadas y vigentes de la agencia con acceso (para confirmar la reserva)
  for (let n = 0; n < 2; n++) {
    const creada = new Date(ahora.getTime() - azar.entero(20, 40) * HORA);
    await operacion({ creada, agencia: agenciaConAcceso, producto: productoParaAgencia(agenciaConAcceso, vendibles), estadoCot: 'aprobada', anticipacion: azar.entero(20, 45) });
  }
  // Cotizaciones pendientes de respuesta del mayorista (últimas 48 hs: no vencen todavía)
  for (let n = 0; n < 4; n++) {
    const creada = new Date(ahora.getTime() - azar.entero(2, 40) * HORA);
    const agencia = n < 2 ? agenciaConAcceso : azar.ponderado(recientes);
    await operacion({ creada, agencia, producto: productoParaAgencia(agencia, vendibles), estadoCot: 'pendiente', anticipacion: azar.entero(15, 40) });
  }

  // 11. Sesiones de los tres usuarios (y algunos intentos fallidos)
  const sesiones = [
    { usuario: admin, cada: 9, extra: {} },
    { usuario: usuarioMayorista, cada: 2, extra: { mayorista_id: mayoristaId } },
    { usuario: { _id: agenciaConAcceso.usuarioId }, cada: 3, extra: { mayorista_id: mayoristaId, agencia_id: agenciaConAcceso._id } },
  ];
  for (const s of sesiones) {
    for (let d = 60; d >= 1; d -= s.cada) {
      const entrada = new Date(ahora.getTime() - d * DIA + azar.entero(9, 12) * HORA);
      await auditar({ usuario_id: s.usuario._id, ...s.extra, accion: 'LOGIN_EXITOSO', categoria: 'seguridad', timestamp: entrada });
      if (azar.rnd() < 0.6) {
        await auditar({ usuario_id: s.usuario._id, ...s.extra, accion: 'LOGOUT', categoria: 'seguridad', timestamp: new Date(entrada.getTime() + azar.entero(1, 5) * HORA) });
      }
    }
  }
  for (let n = 0; n < 3; n++) {
    await auditar({
      usuario_id: usuarioMayorista._id, mayorista_id: mayoristaId, accion: 'LOGIN_FALLIDO', categoria: 'seguridad',
      resultado: 'fallido', detalle: { motivo: 'Contraseña incorrecta' }, timestamp: new Date(ahora.getTime() - azar.entero(3, 50) * DIA),
    });
  }

  console.log('✅ Base de la mesa final cargada:', {
    agencias: agencias.length, productos: productos.length, ...cuenta,
  });
  console.log('\nUsuarios con acceso:');
  console.log(`  Admin     → ${process.env.ADMIN_EMAIL} (clave: ADMIN_PASSWORD del .env)`);
  console.log(`  Mayorista → ${MAYORISTA.email} / ${MAYORISTA.password}`);
  console.log(`  Agencia   → ${AGENCIAS[0].email} / ${AGENCIAS[0].password}`);
}

// ─────────────────────────────────────────────

(async () => {
  try {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      throw new Error('Faltan ADMIN_EMAIL y ADMIN_PASSWORD en el .env');
    }
    await mongoose.connect(process.env.MONGO_URI);
    const base = mongoose.connection.name;
    if (base !== BASE_PERMITIDA) {
      throw new Error(`El MONGO_URI apunta a la base "${base}". Este seed borra todo y solo corre sobre "${BASE_PERMITIDA}".`);
    }
    await mongoose.connection.dropDatabase();
    console.log(`🧹 Base "${base}" vaciada`);
    await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
    await cargar();
  } catch (error) {
    console.error('❌ Error en el seed de la mesa final:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
