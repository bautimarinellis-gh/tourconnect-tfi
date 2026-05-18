const mongoose = require('mongoose');
const Cotizacion = require('../models/Cotizacion');

const COTIZACION_POPULATE = {
  path: 'cotizacion_id',
  populate: [
    { path: 'producto_id', select: 'nombre tipo precio_base' },
    { path: 'agencia_id', select: 'nombre' },
    { path: 'mayorista_id', select: 'nombre razon_social' },
  ],
};

function enriquecerReserva(reserva, extras = {}) {
  const json = reserva.toJSON ? reserva.toJSON() : { ...reserva };
  const cot = json.cotizacion_id;

  if (cot && typeof cot === 'object' && cot._id) {
    return {
      ...json,
      precio_final: cot.precio_total,
      agencia_id: cot.agencia_id,
      producto_id: cot.producto_id,
      mayorista_id: cot.mayorista_id,
      pasajeros: cot.pasajeros,
      fecha_inicio: cot.fecha_inicio,
      fecha_fin: cot.fecha_fin,
      ...extras,
    };
  }

  return { ...json, ...extras };
}

async function buildCotizacionIdsFilter(reqUsuario, query = {}) {
  const { rol, mayorista_id, agencia_id } = reqUsuario;
  const cotQuery = {};

  if (rol === 'mayorista') {
    cotQuery.mayorista_id = new mongoose.Types.ObjectId(mayorista_id);
    if (query.agencia_id) {
      cotQuery.agencia_id = new mongoose.Types.ObjectId(query.agencia_id);
    }
  } else if (rol === 'agencia') {
    cotQuery.agencia_id = new mongoose.Types.ObjectId(agencia_id);
  }

  if (query.desde || query.hasta) {
    cotQuery.fecha_inicio = {};
    if (query.desde) cotQuery.fecha_inicio.$gte = new Date(query.desde);
    if (query.hasta) cotQuery.fecha_inicio.$lte = new Date(query.hasta);
  }

  return Cotizacion.find(cotQuery).distinct('_id');
}

function validarAccesoReserva(reserva, reqUsuario) {
  const cot = reserva.cotizacion_id;
  if (!cot || !cot._id) {
    return { ok: false, status: 500, message: 'Cotización no cargada en la reserva' };
  }

  const mayoristaId = cot.mayorista_id?._id?.toString() || cot.mayorista_id?.toString();
  const agenciaId = cot.agencia_id?._id?.toString() || cot.agencia_id?.toString();

  if (reqUsuario.rol === 'mayorista' && mayoristaId !== reqUsuario.mayorista_id?.toString()) {
    return { ok: false, status: 403, message: 'No tienes permisos sobre esta reserva' };
  }

  if (reqUsuario.rol === 'agencia' && agenciaId !== reqUsuario.agencia_id?.toString()) {
    return { ok: false, status: 403, message: 'No tienes permisos sobre esta reserva' };
  }

  return { ok: true, cot };
}

function obtenerPrecioFinal(reserva) {
  const cot = reserva.cotizacion_id;
  if (!cot?.precio_total) return null;
  return parseFloat(cot.precio_total.toString());
}

/**
 * Último rechazo de pago desde historial (estado pago_informado → pendiente_pago).
 */
function extraerUltimoRechazo(historial) {
  if (!historial?.length) return null;
  const rechazos = historial.filter(
    (h) => h.estado_anterior === 'pago_informado' && h.estado_nuevo === 'pendiente_pago'
  );
  if (!rechazos.length) return null;
  const ultimo = rechazos[rechazos.length - 1];
  const motivo = ultimo.comentario?.replace(/^Pago rechazado\.\s*Motivo:\s*/i, '') || ultimo.comentario;
  return {
    motivo,
    rechazado_at: ultimo.created_at,
  };
}

module.exports = {
  COTIZACION_POPULATE,
  enriquecerReserva,
  buildCotizacionIdsFilter,
  validarAccesoReserva,
  obtenerPrecioFinal,
  extraerUltimoRechazo,
};
