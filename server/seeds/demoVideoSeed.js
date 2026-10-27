/**
 * Seed de datos de demo para grabar el video comercial (Punto 6.6.1).
 *
 * Completa a la Agencia Demo (seeds/demoSeed.js) con un catálogo y una
 * operación de ejemplo, usando los productos de seeds/demoAsistenteSeed.js:
 *  - asigna los productos de la demo a la Agencia Demo, con su markup
 *  - una reserva pagada con su historial de estados y su pago
 *  - una reserva con el pago informado, para confirmarlo en vivo
 * La cotización de Bariloche (Hotel Llao Llao) la arma la agencia en el video.
 *
 * Hay que correrlo DESPUÉS de demoAsistenteSeed.js: ese seed, al limpiar,
 * borra todo lo que usa sus productos (incluido lo de acá).
 *
 * Los datos quedan identificados por la Agencia Demo + los productos
 * "[demo asistente]" (de ahí salen la cotización, la reserva, su historial y su pago).
 *
 * Uso:
 *   node seeds/demoVideoSeed.js            → borra la demo del video y la vuelve a cargar
 *   node seeds/demoVideoSeed.js --limpiar  → solo borra la demo del video
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
const EMAIL_AGENCIA_DEMO = 'agencia@gmail.com';
const MARCA_PRODUCTO = '[demo asistente]';

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;

// Markup de la Agencia Demo por producto (lo que muestra el video: "su margen")
const MARKUPS = {
  'Hotel Llao Llao': 12, // en el video se sube a 15% en vivo
  'Hotel Cataratas': 12,
  'Excursión Glaciar Perito Moreno': 18,
  'Rafting en Mendoza': 14,
  'Paquete Salta y Jujuy': 12,
  'Paquete Ushuaia Fin del Mundo': 16,
  'Hotel Termas de Río Hondo': 13,
};

/** Fecha de calendario (medianoche UTC) a N días de un instante, en hora argentina. */
function diaCalendario(instante, dias) {
  const ar = new Date(instante.getTime() - 3 * HORA);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + dias));
}

const dec = (n) => mongoose.Types.Decimal128.fromString(n.toFixed(2));

/** Guarda respetando las fechas del documento (sin pisar created_at). */
async function guardar(Model, datos) {
  const doc = new Model(datos);
  await doc.save({ timestamps: false });
  return doc;
}

async function buscarBase() {
  const usuarioMayorista = await Usuario.findOne({ email: EMAIL_MAYORISTA_DEMO }).select('_id mayorista_id').lean();
  const usuarioAgencia = await Usuario.findOne({ email: EMAIL_AGENCIA_DEMO }).select('_id').lean();
  if (!usuarioMayorista?.mayorista_id || !usuarioAgencia) {
    throw new Error('No existen los usuarios demo. Corré primero: npm run seed:demo');
  }
  const agencia = await Agencia.findOne({ usuario_id: usuarioAgencia._id }).select('_id').lean();
  if (!agencia) throw new Error(`No existe la agencia de ${EMAIL_AGENCIA_DEMO}. Corré primero: npm run seed:demo`);

  const productos = await Producto.find({
    mayorista_id: usuarioMayorista.mayorista_id,
    descripcion: { $regex: MARCA_PRODUCTO.replace(/[[\]]/g, '\\$&') },
  }).lean();
  return { usuarioMayorista, usuarioAgencia, agencia, productos };
}

async function limpiar({ agencia, productos }) {
  const productoIds = productos.map((p) => p._id);
  const cotizaciones = await Cotizacion.find({ agencia_id: agencia._id, producto_id: { $in: productoIds } }).select('_id').lean();
  const reservas = await Reserva.find({ cotizacion_id: { $in: cotizaciones.map((c) => c._id) } }).select('_id').lean();
  const reservaIds = reservas.map((r) => r._id);

  const borrados = {
    pagos: (await Pago.deleteMany({ reserva_id: { $in: reservaIds } })).deletedCount,
    historial: (await HistorialEstadoReserva.deleteMany({ reserva_id: { $in: reservaIds } })).deletedCount,
    reservas: (await Reserva.deleteMany({ _id: { $in: reservaIds } })).deletedCount,
    cotizaciones: (await Cotizacion.deleteMany({ _id: { $in: cotizaciones.map((c) => c._id) } })).deletedCount,
    asignaciones: (await AgenciaProducto.deleteMany({ agencia_id: agencia._id, producto_id: { $in: productoIds } })).deletedCount,
  };
  console.log('🧹 Demo del video anterior borrada:', borrados);
}

async function cargar({ usuarioMayorista, usuarioAgencia, agencia, productos }) {
  const ahora = new Date();
  const mayoristaId = usuarioMayorista.mayorista_id;
  const porNombre = Object.fromEntries(productos.map((p) => [p.nombre, p]));

  // Catálogo de la Agencia Demo (solo los productos con disponibilidad vigente)
  let asignaciones = 0;
  for (const [nombre, markup] of Object.entries(MARKUPS)) {
    if (!porNombre[nombre]) continue;
    await AgenciaProducto.create({ agencia_id: agencia._id, producto_id: porNombre[nombre]._id, markup_porcentaje: markup });
    asignaciones++;
  }

  const precioUnitario = (producto) => producto.precio_base * (1 + MARKUPS[producto.nombre] / 100);

  /** Cotización ya convertida en reserva, con su historial y su pago informado. */
  async function reservaDemo({ producto, pax, noches, haceDias, saleEnDias, pagada, comprobante }) {
    const creada = new Date(ahora.getTime() - haceDias * DIA - 3 * HORA);
    const inicio = diaCalendario(ahora, saleEnDias);
    const unit = precioUnitario(producto);
    const unidades = producto.tipo === 'hotel' ? noches : 1;
    const total = unit * pax * unidades;
    const cot = await guardar(Cotizacion, {
      agencia_id: agencia._id, producto_id: producto._id, mayorista_id: mayoristaId,
      pasajeros: pax, fecha_inicio: inicio, fecha_fin: new Date(inicio.getTime() + noches * DIA),
      precio_total: dec(total), tipo_producto: producto.tipo, precio_unitario: dec(unit),
      markup_porcentaje: MARKUPS[producto.nombre], unidades, estado: 'reserva_generada',
      aprobada_at: new Date(creada.getTime() + 2 * HORA),
      created_at: creada, updated_at: creada,
    });
    const reservada = new Date(creada.getTime() + 5 * HORA);
    const informado = new Date(reservada.getTime() + 1 * DIA + 4 * HORA);
    const confirmado = new Date(informado.getTime() + 18 * HORA);
    const reserva = await guardar(Reserva, {
      cotizacion_id: cot._id, mayorista_id: mayoristaId, agencia_id: agencia._id,
      estado: pagada ? 'pagada' : 'pago_informado',
      created_at: reservada, updated_at: pagada ? confirmado : informado,
    });
    const pasos = [
      { at: reservada, usuario: usuarioAgencia._id, de: null, a: 'pendiente_pago', comentario: 'Reserva generada desde la cotización' },
      { at: informado, usuario: usuarioAgencia._id, de: 'pendiente_pago', a: 'pago_informado', comentario: 'Transferencia informada por la agencia' },
    ];
    if (pagada) pasos.push({ at: confirmado, usuario: usuarioMayorista._id, de: 'pago_informado', a: 'pagada', comentario: 'Pago verificado' });
    for (const p of pasos) {
      await guardar(HistorialEstadoReserva, {
        reserva_id: reserva._id, usuario_id: p.usuario, estado_anterior: p.de, estado_nuevo: p.a,
        comentario: p.comentario, created_at: p.at,
      });
    }
    await guardar(Pago, {
      reserva_id: reserva._id, registrado_por: usuarioAgencia._id, monto: dec(total),
      metodo: 'transferencia', comprobante, fecha_pago: diaCalendario(informado, 0),
      created_at: informado,
    });
    return reserva;
  }

  // Reserva pagada con historial completo: Salta y Jujuy, 2 pasajeros, sale en 3 semanas
  const pagada = await reservaDemo({
    producto: porNombre['Paquete Salta y Jujuy'], pax: 2, noches: 5, haceDias: 4, saleEnDias: 21, pagada: true, comprobante: 'DEMO-VIDEO-1',
  });
  // Reserva con el pago informado, para confirmarlo en vivo en el video: Cataratas, 3 pasajeros, 4 noches
  const porConfirmar = await reservaDemo({
    producto: porNombre['Hotel Cataratas'], pax: 3, noches: 4, haceDias: 2, saleEnDias: 28, pagada: false, comprobante: 'TRF-0042817',
  });

  console.log('✅ Demo del video cargada:', {
    asignaciones, reservas: 2, reserva_pagada: String(pagada._id), reserva_pago_informado: String(porConfirmar._id),
  });
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const base = await buscarBase();
    if (!base.productos.length) {
      throw new Error('No están los productos de la demo del asistente. Corré primero: npm run seed:demo-asistente');
    }
    await limpiar(base);
    if (process.argv.includes('--limpiar')) return;
    await cargar(base);
  } catch (error) {
    console.error('❌ Error en el seed de demo del video:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
