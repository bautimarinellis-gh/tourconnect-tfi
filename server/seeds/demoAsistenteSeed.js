/**
 * Seed de datos de demo para el Asistente Inteligente.
 *
 * Carga en el Mayorista Demo (el de seeds/demoSeed.js, que tiene que existir)
 * varias agencias, productos y ~8 meses de operaciones: cotizaciones en todos
 * sus estados, reservas (con cancelaciones y viajes próximos) y pagos (por
 * confirmar, confirmados y rechazados). Así el asistente tiene algo para
 * mostrar: rankings, evolución mensual, comparaciones, agencias inactivas,
 * productos sin reservas, etc.
 *
 * Es determinístico (mismo generador pseudoaleatorio con semilla fija): cada
 * corrida arma la misma historia, relativa a la fecha del día.
 *
 * Los datos quedan marcados para poder borrarlos sin tocar nada más:
 *  - usuarios de agencia con email asistente.demoN@tourconnect.test (inactivos,
 *    sin contraseña: no pueden iniciar sesión)
 *  - productos con "[demo asistente]" en la descripción
 *
 * Uso:
 *   node seeds/demoAsistenteSeed.js            → borra la demo anterior y la vuelve a cargar
 *   node seeds/demoAsistenteSeed.js --limpiar  → solo borra la demo
 *
 * Conviene correrlo el día antes de mostrarlo: las cotizaciones "pendientes"
 * vencen solas a las 72 hs y los viajes "próximos" se calculan desde hoy.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

const Usuario = require('../models/Usuario');
const Agencia = require('../models/Agencia');
const Producto = require('../models/Producto');
const AgenciaProducto = require('../models/AgenciaProducto');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const Pago = require('../models/Pago');
const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');

const EMAIL_MAYORISTA_DEMO = 'mayorista@gmail.com';
const MARCA_PRODUCTO = '[demo asistente]';
const emailAgencia = (i) => `asistente.demo${i}@tourconnect.test`;
const PATRON_EMAIL = /^asistente\.demo\d+@tourconnect\.test$/;

const DIA = 24 * 60 * 60 * 1000;
const MESES_HISTORIA = 8;

// ─────────────────────────────────────────────
// Catálogo de la demo
// ─────────────────────────────────────────────

// peso: cuánto opera; cancela: probabilidad de cancelar; hastaHaceDias: deja
// de operar hace N días (para que aparezca como inactiva); nunca: sin operaciones.
const AGENCIAS = [
  { nombre: 'Viajes del Sur', razon: 'Viajes del Sur S.R.L.', peso: 35, cancela: 0.08 },
  { nombre: 'Norte Turismo', razon: 'Norte Turismo S.A.', peso: 25, cancela: 0.35 },
  { nombre: 'Andes Travel', razon: 'Andes Travel S.R.L.', peso: 20, cancela: 0.1 },
  { nombre: 'Patagonia Express', razon: 'Patagonia Express S.A.', peso: 15, cancela: 0.12 },
  { nombre: 'Litoral Viajes', razon: 'Litoral Viajes S.R.L.', peso: 12, cancela: 0.1, hastaHaceDias: 75 },
  { nombre: 'Cuyo Destinos', razon: 'Cuyo Destinos S.A.', peso: 0, cancela: 0, nunca: true },
];

const PRODUCTOS = [
  { tipo: 'hotel', nombre: 'Hotel Llao Llao', precio: 180, extra: { direccion: 'Av. Bustillo km 25, Bariloche', estrellas: 5, cupo_maximo: 60 } },
  { tipo: 'hotel', nombre: 'Hotel Cataratas', precio: 120, extra: { direccion: 'Ruta 12 km 4, Puerto Iguazú', estrellas: 4, cupo_maximo: 80 } },
  { tipo: 'actividad', nombre: 'Excursión Glaciar Perito Moreno', precio: 95, extra: { cupo_maximo: 40, duracion_horas: 8 } },
  { tipo: 'actividad', nombre: 'Rafting en Mendoza', precio: 60, extra: { cupo_maximo: 20, duracion_horas: 4 } },
  { tipo: 'paquete', nombre: 'Paquete Salta y Jujuy', precio: 650, extra: { itinerario: '5 días: Salta, Cafayate, Purmamarca y Humahuaca.', cupo_maximo: 30 } },
  { tipo: 'paquete', nombre: 'Paquete Ushuaia Fin del Mundo', precio: 890, extra: { itinerario: '6 días: Ushuaia, Tren del Fin del Mundo y Canal Beagle.', cupo_maximo: 30 } },
  // Sin operaciones: para "¿qué productos nunca se reservaron?"
  { tipo: 'hotel', nombre: 'Hotel Termas de Río Hondo', precio: 90, extra: { direccion: 'Av. San Martín 300, Termas de Río Hondo', estrellas: 3, cupo_maximo: 40 }, nunca: true },
  // Con la disponibilidad vencida: las agencias y el asistente ya no lo ven,
  // el mayorista lo ve con la etiqueta "Vencido".
  { tipo: 'actividad', nombre: 'Avistaje de ballenas en Puerto Madryn', precio: 70, extra: { cupo_maximo: 25, duracion_horas: 3 }, nunca: true, vencido: true },
];

const METODOS = ['transferencia', 'transferencia', 'transferencia', 'mercadopago', 'efectivo', 'cheque'];
const MOTIVOS_RECHAZO = ['Sin disponibilidad en las fechas pedidas.', 'Tarifa no vigente para esa temporada.'];

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
  const ar = new Date(instante.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + dias));
}

const cuitDemo = (i) => `30-7999${String(i).padStart(4, '0')}-${i % 10}`;
const dec = (n) => mongoose.Types.Decimal128.fromString(n.toFixed(2));

/** Guarda respetando las fechas del documento (sin pisar created_at). */
async function guardar(Model, datos) {
  const doc = new Model(datos);
  await doc.save({ timestamps: false });
  return doc;
}

// ─────────────────────────────────────────────
// Limpieza
// ─────────────────────────────────────────────

async function limpiar() {
  const usuarios = await Usuario.find({ email: PATRON_EMAIL }).select('_id').lean();
  const agencias = await Agencia.find({ usuario_id: { $in: usuarios.map((u) => u._id) } }).select('_id').lean();
  const productos = await Producto.find({ descripcion: { $regex: MARCA_PRODUCTO.replace(/[[\]]/g, '\\$&') } }).select('_id').lean();

  const agenciaIds = agencias.map((a) => a._id);
  const productoIds = productos.map((p) => p._id);

  const cotizaciones = await Cotizacion.find({
    $or: [{ agencia_id: { $in: agenciaIds } }, { producto_id: { $in: productoIds } }],
  }).select('_id').lean();
  const reservas = await Reserva.find({ cotizacion_id: { $in: cotizaciones.map((c) => c._id) } }).select('_id').lean();
  const reservaIds = reservas.map((r) => r._id);

  const borrados = {
    pagos: (await Pago.deleteMany({ reserva_id: { $in: reservaIds } })).deletedCount,
    historial: (await HistorialEstadoReserva.deleteMany({ reserva_id: { $in: reservaIds } })).deletedCount,
    reservas: (await Reserva.deleteMany({ _id: { $in: reservaIds } })).deletedCount,
    cotizaciones: (await Cotizacion.deleteMany({ _id: { $in: cotizaciones.map((c) => c._id) } })).deletedCount,
    asignaciones: (await AgenciaProducto.deleteMany({
      $or: [{ agencia_id: { $in: agenciaIds } }, { producto_id: { $in: productoIds } }],
    })).deletedCount,
    agencias: (await Agencia.deleteMany({ _id: { $in: agenciaIds } })).deletedCount,
    usuarios: (await Usuario.deleteMany({ _id: { $in: usuarios.map((u) => u._id) } })).deletedCount,
    productos: (await Producto.deleteMany({ _id: { $in: productoIds } })).deletedCount,
  };
  console.log('🧹 Demo anterior borrada:', borrados);
}

// ─────────────────────────────────────────────
// Carga
// ─────────────────────────────────────────────

async function cargar(mayoristaId) {
  const azar = crearAzar(20260930);
  const ahora = new Date();

  // Agencias (cada una con su usuario, inactivo y sin contraseña)
  const agencias = [];
  for (const [i, def] of AGENCIAS.entries()) {
    const usuario = await Usuario.create({
      email: emailAgencia(i + 1), rol: 'agencia', nombre: def.nombre, mayorista_id: mayoristaId, activo: false,
    });
    const agencia = await Agencia.create({
      usuario_id: usuario._id, mayorista_id: mayoristaId, nombre: def.nombre,
      razon_social: def.razon, cuit: cuitDemo(i + 1), activo: true,
    });
    agencias.push({ ...def, _id: agencia._id, usuarioId: usuario._id });
  }

  // Productos
  const desde = new Date(ahora.getTime() - 400 * DIA);
  const hasta = new Date(ahora.getTime() + 400 * DIA);
  const productos = [];
  for (const def of PRODUCTOS) {
    const producto = await Producto.create({
      mayorista_id: mayoristaId, tipo: def.tipo, nombre: def.nombre,
      descripcion: `${def.nombre}. ${MARCA_PRODUCTO}`,
      precio_base: def.precio,
      disponibilidad_desde: def.vencido ? new Date(ahora.getTime() - 200 * DIA) : desde,
      disponibilidad_hasta: def.vencido ? new Date(ahora.getTime() - 10 * DIA) : hasta,
      activo: true, ...def.extra,
    });
    productos.push({ ...def, _id: producto._id });
  }

  // Asignaciones con markup (el catálogo de cada agencia)
  const markups = new Map();
  for (const a of agencias) {
    for (const p of productos) {
      const markup = azar.entero(8, 20);
      markups.set(`${a._id}|${p._id}`, markup);
      await AgenciaProducto.create({ agencia_id: a._id, producto_id: p._id, markup_porcentaje: markup });
    }
  }

  const operan = agencias.filter((a) => !a.nunca);
  const vendibles = productos.filter((p) => !p.nunca);
  const hoy = diaCalendario(ahora, 0);
  const cuenta = { cotizaciones: 0, reservas: 0, pagos: 0 };

  /** Crea una cotización (y, si corresponde, su reserva y sus pagos). */
  async function operacion({ creada, agencia, producto, estadoCot, estadoReserva, pago, anticipacion }) {
    const pax = azar.entero(1, 6);
    const noches = producto.tipo === 'hotel' ? azar.entero(2, 7) : 1;
    const fechaInicio = diaCalendario(creada, anticipacion);
    const duracion = producto.tipo === 'hotel' ? noches : producto.tipo === 'paquete' ? 5 : 0;
    const fechaFin = new Date(fechaInicio.getTime() + duracion * DIA);
    const markup = markups.get(`${agencia._id}|${producto._id}`);
    const unitario = producto.precio * (1 + markup / 100);
    const total = unitario * pax * noches;

    const cot = await guardar(Cotizacion, {
      agencia_id: agencia._id, producto_id: producto._id, mayorista_id: mayoristaId,
      pasajeros: pax, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      precio_total: dec(total), tipo_producto: producto.tipo, precio_unitario: dec(unitario),
      markup_porcentaje: markup, unidades: noches, estado: estadoCot,
      aprobada_at: ['aprobada', 'reserva_generada'].includes(estadoCot) ? new Date(creada.getTime() + 6 * 3600e3) : null,
      motivo_rechazo: estadoCot === 'rechazada' ? azar.elegir(MOTIVOS_RECHAZO) : undefined,
      created_at: creada, updated_at: creada,
    });
    cuenta.cotizaciones++;
    if (estadoCot !== 'reserva_generada') return;

    const reservada = new Date(creada.getTime() + azar.entero(12, 36) * 3600e3);
    const reserva = await guardar(Reserva, {
      cotizacion_id: cot._id, mayorista_id: mayoristaId, agencia_id: agencia._id, estado: estadoReserva,
      motivo_cancelacion: estadoReserva === 'cancelada' ? 'La agencia canceló la reserva (datos de demo).' : undefined,
      created_at: reservada, updated_at: reservada,
    });
    cuenta.reservas++;
    await guardar(HistorialEstadoReserva, {
      reserva_id: reserva._id, usuario_id: null, estado_anterior: null, estado_nuevo: estadoReserva,
      comentario: 'Datos de demo del asistente', created_at: reservada,
    });

    const informado = new Date(reservada.getTime() + azar.entero(1, 5) * DIA);
    const nuevoPago = (extra) => guardar(Pago, {
      reserva_id: reserva._id, registrado_por: agencia.usuarioId, monto: dec(total),
      metodo: azar.elegir(METODOS), comprobante: `DEMO-${cuenta.pagos + 1}`,
      fecha_pago: diaCalendario(informado, 0), created_at: informado, ...extra,
    }).then(() => { cuenta.pagos++; });

    if (pago === 'rechazado') {
      await nuevoPago({ rechazado: true, motivo_rechazo: 'El comprobante no coincide con el monto.', rechazado_at: new Date(informado.getTime() + DIA) });
    } else if (['pagada', 'cerrada', 'pago_informado'].includes(estadoReserva)) {
      await nuevoPago({});
    }
  }

  // Historia de los últimos meses, con más movimiento hacia el presente
  for (let hace = MESES_HISTORIA; hace >= 0; hace--) {
    const cantidad = 5 + (MESES_HISTORIA - hace) * 2;
    for (let n = 0; n < cantidad; n++) {
      const diasAtras = hace * 30 + azar.entero(0, 29);
      if (diasAtras < 4) continue; // lo reciente se arma aparte (pendientes)
      const creada = new Date(ahora.getTime() - diasAtras * DIA - azar.entero(0, 10) * 3600e3);
      const disponibles = operan.filter((a) => !a.hastaHaceDias || diasAtras > a.hastaHaceDias);
      const agencia = azar.ponderado(disponibles);
      const producto = azar.elegir(vendibles);
      const anticipacion = azar.entero(10, 50);
      const viajePaso = diaCalendario(creada, anticipacion) < hoy;

      const r = azar.rnd();
      let estadoCot = 'reserva_generada';
      if (r < 0.12) estadoCot = 'rechazada';
      else if (r < 0.22) estadoCot = 'vencida';
      else if (r < 0.27) estadoCot = 'cancelada';

      let estadoReserva;
      let pago = null;
      if (azar.rnd() < agencia.cancela) estadoReserva = 'cancelada';
      else if (viajePaso) estadoReserva = azar.rnd() < 0.7 ? 'cerrada' : 'pagada';
      else {
        // Viaje por venir: pendiente de pago solo si el viaje no pasó (si no,
        // el proceso automático la cancelaría)
        const s = azar.rnd();
        if (s < 0.3) estadoReserva = 'pendiente_pago';
        else if (s < 0.55) estadoReserva = 'pago_informado';
        else estadoReserva = 'pagada';
        if (estadoReserva === 'pendiente_pago' && azar.rnd() < 0.3) pago = 'rechazado';
      }
      await operacion({ creada, agencia, producto, estadoCot, estadoReserva, pago, anticipacion });
    }
  }

  // Viajes de la semana que viene y del mes próximo (reservas hechas hace poco)
  for (let n = 0; n < 6; n++) {
    const creada = new Date(ahora.getTime() - azar.entero(5, 20) * DIA);
    const diasHastaViaje = n < 3 ? azar.entero(6, 12) : azar.entero(20, 45);
    const anticipacion = Math.round((diaCalendario(ahora, diasHastaViaje) - diaCalendario(creada, 0)) / DIA);
    await operacion({
      creada, agencia: azar.ponderado(operan.filter((a) => !a.hastaHaceDias)), producto: azar.elegir(vendibles),
      estadoCot: 'reserva_generada', estadoReserva: azar.elegir(['pagada', 'pago_informado', 'pendiente_pago']),
      pago: null, anticipacion,
    });
  }

  // Cotizaciones pendientes de respuesta (de las últimas 48 hs: no vencieron)
  for (let n = 0; n < 4; n++) {
    const creada = new Date(ahora.getTime() - azar.entero(2, 46) * 3600e3);
    await operacion({
      creada, agencia: azar.ponderado(operan.filter((a) => !a.hastaHaceDias)), producto: azar.elegir(vendibles),
      estadoCot: 'pendiente', anticipacion: azar.entero(15, 40),
    });
  }

  console.log('✅ Demo cargada:', {
    agencias: agencias.length, productos: productos.length, ...cuenta,
  });
}

// ─────────────────────────────────────────────

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    await limpiar();
    if (process.argv.includes('--limpiar')) return;

    const usuarioMayorista = await Usuario.findOne({ email: EMAIL_MAYORISTA_DEMO }).select('mayorista_id').lean();
    if (!usuarioMayorista?.mayorista_id) {
      throw new Error(`No existe el mayorista demo (${EMAIL_MAYORISTA_DEMO}). Corré primero: npm run seed:demo`);
    }
    await cargar(usuarioMayorista.mayorista_id);
  } catch (error) {
    console.error('❌ Error en el seed de demo del asistente:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
