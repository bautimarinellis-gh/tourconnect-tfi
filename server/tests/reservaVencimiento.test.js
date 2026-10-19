const { test, describe, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Antes de requerir el módulo: reservaVencimiento toma la referencia al cargarse.
const auditService = require('../utils/auditService');
mock.method(auditService, 'registrarAuditoria', async () => {});

const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const HistorialEstadoReserva = require('../models/HistorialEstadoReserva');
const {
  cancelarReservasVencidas,
  cerrarReservasFinalizadas,
  MOTIVO_AUTOMATICO,
  MOTIVO_CIERRE_AUTOMATICO,
} = require('../utils/reservaVencimiento');

const sesionFalsa = { withTransaction: async (fn) => fn(), endSession: async () => {} };

describe('cancelarReservasVencidas', () => {
  let historial;
  let updates;

  beforeEach(() => {
    historial = [];
    updates = [];
    mock.method(mongoose, 'startSession', async () => sesionFalsa);
    mock.method(Cotizacion, 'find', () => ({ distinct: async () => ['c1', 'c2'] }));
    mock.method(Reserva, 'find', () => ({
      populate: async () => [
        { _id: 'r1', cotizacion_id: { mayorista_id: 'm1', agencia_id: 'a1' } },
        { _id: 'r2', cotizacion_id: { mayorista_id: 'm1', agencia_id: 'a2' } },
      ],
    }));
    mock.method(HistorialEstadoReserva, 'create', async ([registro]) => { historial.push(registro); return [registro]; });
  });

  test('cancela las reservas pendientes de pago cuyo viaje pasó, con actor "Sistema"', async () => {
    mock.method(Reserva, 'findOneAndUpdate', async (filtro, cambios) => { updates.push({ filtro, cambios }); return { _id: filtro._id }; });

    const total = await cancelarReservasVencidas();

    assert.equal(total, 2);
    assert.deepEqual(updates[0].filtro, { _id: 'r1', estado: 'pendiente_pago' });
    assert.equal(updates[0].cambios.$set.estado, 'cancelada');
    assert.equal(updates[0].cambios.$set.motivo_cancelacion, MOTIVO_AUTOMATICO);
    assert.equal(historial.length, 2);
    assert.equal(historial[0].usuario_id, null);
    assert.equal(historial[0].estado_nuevo, 'cancelada');
  });

  test('si la reserva cambió de estado en el medio (ej. se informó un pago), no la toca', async () => {
    mock.method(Reserva, 'findOneAndUpdate', async (filtro) => (filtro._id === 'r1' ? null : { _id: filtro._id }));

    const total = await cancelarReservasVencidas();

    assert.equal(total, 1);
    assert.equal(historial.length, 1);
  });
});

describe('cerrarReservasFinalizadas', () => {
  let historial;
  let updates;
  let filtroCotizaciones;

  beforeEach(() => {
    historial = [];
    updates = [];
    mock.method(mongoose, 'startSession', async () => sesionFalsa);
    mock.method(Cotizacion, 'find', (filtro) => { filtroCotizaciones = filtro; return { distinct: async () => ['c1', 'c2'] }; });
    mock.method(Reserva, 'find', () => ({
      populate: async () => [
        { _id: 'r1', cotizacion_id: { mayorista_id: 'm1', agencia_id: 'a1' } },
        { _id: 'r2', cotizacion_id: { mayorista_id: 'm1', agencia_id: 'a2' } },
      ],
    }));
    mock.method(HistorialEstadoReserva, 'create', async ([registro]) => { historial.push(registro); return [registro]; });
  });

  test('cierra las reservas pagadas cuyo viaje terminó, con actor "Sistema"', async () => {
    mock.method(Reserva, 'findOneAndUpdate', async (filtro, cambios) => { updates.push({ filtro, cambios }); return { _id: filtro._id }; });

    const total = await cerrarReservasFinalizadas();

    assert.equal(total, 2);
    assert.ok(filtroCotizaciones.fecha_fin.$lt instanceof Date);
    assert.deepEqual(updates[0].filtro, { _id: 'r1', estado: 'pagada' });
    assert.equal(updates[0].cambios.$set.estado, 'cerrada');
    assert.equal(historial[0].usuario_id, null);
    assert.equal(historial[0].estado_anterior, 'pagada');
    assert.equal(historial[0].estado_nuevo, 'cerrada');
    assert.equal(historial[0].comentario, MOTIVO_CIERRE_AUTOMATICO);
  });

  test('si la reserva cambió de estado en el medio, no la toca', async () => {
    mock.method(Reserva, 'findOneAndUpdate', async (filtro) => (filtro._id === 'r1' ? null : { _id: filtro._id }));

    const total = await cerrarReservasFinalizadas();

    assert.equal(total, 1);
    assert.equal(historial.length, 1);
  });
});
