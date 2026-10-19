const mongoose = require('mongoose');
const Cotizacion = require('../models/Cotizacion');
const Producto = require('../models/Producto');
const Agencia = require('../models/Agencia');

const cotizacionCollection = () => Cotizacion.collection.name;
const productoCollection = () => Producto.collection.name;
const agenciaCollection = () => Agencia.collection.name;

// Campos de tenant que la reserva tiene copiados de su cotización.
const CAMPOS_TENANT = ['mayorista_id', 'agencia_id'];

/**
 * Etapas iniciales: unir reserva con cotización y filtrar por cotización.
 *
 * Si el filtro es por tenant ('cot.mayorista_id' / 'cot.agencia_id'), antes
 * del $lookup se filtra por el mismo campo en la propia reserva, que está
 * indexado: así la unión solo recorre las reservas del tenant y no las de
 * toda la plataforma. El filtro sobre la cotización se mantiene después como
 * segunda capa de aislamiento.
 */
function lookupCotizacionStages(cotMatch = {}) {
  const filtroReserva = {};
  for (const campo of CAMPOS_TENANT) {
    if (cotMatch[`cot.${campo}`] !== undefined) filtroReserva[campo] = cotMatch[`cot.${campo}`];
  }

  const stages = [
    ...(Object.keys(filtroReserva).length > 0 ? [{ $match: filtroReserva }] : []),
    {
      $lookup: {
        from: cotizacionCollection(),
        localField: 'cotizacion_id',
        foreignField: '_id',
        as: 'cot',
      },
    },
    { $unwind: '$cot' },
  ];

  if (Object.keys(cotMatch).length > 0) {
    stages.push({ $match: cotMatch });
  }

  return stages;
}

module.exports = {
  cotizacionCollection,
  productoCollection,
  agenciaCollection,
  lookupCotizacionStages,
};
