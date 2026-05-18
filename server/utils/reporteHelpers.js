const mongoose = require('mongoose');
const Cotizacion = require('../models/Cotizacion');
const Producto = require('../models/Producto');
const Agencia = require('../models/Agencia');

const cotizacionCollection = () => Cotizacion.collection.name;
const productoCollection = () => Producto.collection.name;
const agenciaCollection = () => Agencia.collection.name;

/**
 * Etapas iniciales: unir reserva con cotización y filtrar por cotización.
 */
function lookupCotizacionStages(cotMatch = {}) {
  const stages = [
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

function matchReservaBase(extra = {}) {
  return { estado: { $ne: 'cancelada' }, ...extra };
}

module.exports = {
  cotizacionCollection,
  productoCollection,
  agenciaCollection,
  lookupCotizacionStages,
  matchReservaBase,
};
