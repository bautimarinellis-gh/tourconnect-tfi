const { test, describe, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Reserva = require('../models/Reserva');
const Cotizacion = require('../models/Cotizacion');
const Agencia = require('../models/Agencia');
const { validarConsulta } = require('../utils/piezasConsulta');
const {
  ejecutarConsulta, rangoPeriodo, rangoAnterior, escaparRegex,
} = require('../utils/constructorConsultas');
const { seudonimizar, ocultarNombres, restaurarNombres } = require('../utils/asistenteIA');

const MAYORISTA = '64b000000000000000000001';
const AGENCIA = '64b000000000000000000002';

// Miércoles 30/09/2026, 12:00 en Argentina
const AHORA = new Date('2026-09-30T15:00:00Z');

const TODOS = new Set(['GestionarReservas', 'GestionarCotizaciones', 'GestionarAgencias', 'GestionarProductos', 'VerReportes']);
const SIN_REPORTES = new Set(['GestionarReservas', 'GestionarCotizaciones', 'GestionarAgencias', 'GestionarProductos']);

/** Cadena de Model.find() que devuelve `docs` y guarda el filtro usado. */
function mockFind(Model, docs = []) {
  const llamadas = [];
  mock.method(Model, 'find', (filtro) => {
    llamadas.push(filtro);
    const cadena = {
      select: () => cadena,
      limit: () => cadena,
      lean: async () => docs,
    };
    return cadena;
  });
  return llamadas;
}

afterEach(() => mock.restoreAll());

describe('validarConsulta: piezas y combinaciones', () => {
  test('normaliza una consulta válida y completa los defaults', () => {
    const c = validarConsulta({ fuente: 'reservas', metrica: 'cantidad', agrupar_por: 'agencia' }, TODOS, AHORA);
    assert.deepEqual(c, {
      fuente: 'reservas', modo: 'resumen', metrica: 'cantidad', agrupar_por: 'agencia',
      filtros: { estado: [], tipo_producto: [], agencia: null, producto: null, metodo_pago: [] },
      fecha: 'creacion', periodo: { time_range: 'last_30_days' }, comparar: false, orden: 'desc', limite: 10,
    });
  });

  test('rechaza fuentes, métricas o agrupaciones que no existen o no combinan', () => {
    assert.equal(validarConsulta({ fuente: 'usuarios', metrica: 'cantidad' }, TODOS), null);
    assert.equal(validarConsulta({ fuente: 'reservas', metrica: 'monto_pagado' }, TODOS), null);
    assert.equal(validarConsulta({ fuente: 'reservas', metrica: 'cantidad', agrupar_por: 'metodo_pago' }, TODOS), null);
    assert.equal(validarConsulta({ fuente: 'agencias', metrica: 'sin_reservas', agrupar_por: 'agencia' }, TODOS), null);
  });

  test('las métricas de dinero exigen VerReportes', () => {
    assert.equal(validarConsulta({ fuente: 'reservas', metrica: 'facturacion' }, SIN_REPORTES), null);
    assert.equal(validarConsulta({ fuente: 'cotizaciones', metrica: 'tasa_conversion' }, SIN_REPORTES), null);
    assert.ok(validarConsulta({ fuente: 'reservas', metrica: 'facturacion' }, TODOS));
  });

  test('el monto de pagos es la excepción: alcanza con GestionarReservas', () => {
    const c = validarConsulta({ fuente: 'pagos', metrica: 'monto_pagado' }, new Set(['GestionarReservas']));
    assert.equal(c.metrica, 'monto_pagado');
  });

  test('sin el permiso de la fuente no hay consulta', () => {
    assert.equal(validarConsulta({ fuente: 'cotizaciones', metrica: 'cantidad' }, new Set(['GestionarReservas'])), null);
    assert.equal(validarConsulta({ fuente: 'reservas', metrica: 'cantidad' }, new Set()), null);
  });

  test('los períodos futuros solo valen para la fecha de viaje', () => {
    const creacion = validarConsulta({ fuente: 'reservas', metrica: 'cantidad', periodo: { time_range: 'next_week' } }, TODOS, AHORA);
    assert.deepEqual(creacion.periodo, { time_range: 'last_30_days' });
    const viaje = validarConsulta({ fuente: 'reservas', modo: 'listado', fecha: 'viaje', periodo: { time_range: 'next_week' } }, TODOS, AHORA);
    assert.deepEqual(viaje.periodo, { time_range: 'next_week' });
  });

  test('descarta valores fuera de rango o de lista', () => {
    const c = validarConsulta({
      fuente: 'reservas', metrica: 'cantidad', limite: 500,
      filtros: { estado: ['cancelada', 'borrada'], agencia: 'A', tipo_producto: ['crucero', 'hotel'] },
      periodo: { time_range: 'specific_month', month: 13, year: 2026 },
    }, TODOS, AHORA);
    assert.equal(c.limite, 10);
    assert.deepEqual(c.filtros.estado, ['cancelada']);
    assert.deepEqual(c.filtros.tipo_producto, ['hotel']);
    assert.equal(c.filtros.agencia, null);
    assert.deepEqual(c.periodo, { time_range: 'last_30_days' });
  });

  test('en un listado la métrica y la agrupación no aplican', () => {
    const c = validarConsulta({ fuente: 'pagos', modo: 'listado', metrica: 'monto_pagado', agrupar_por: 'agencia' }, TODOS, AHORA);
    assert.equal(c.metrica, 'cantidad');
    assert.equal(c.agrupar_por, 'ninguno');
  });

  test('no compara sobre la serie mensual ni sobre todo el historial', () => {
    const mes = validarConsulta({ fuente: 'reservas', metrica: 'cantidad', agrupar_por: 'mes', comparar: 'periodo_anterior' }, TODOS, AHORA);
    assert.equal(mes.comparar, false);
    const todo = validarConsulta({ fuente: 'reservas', metrica: 'cantidad', periodo: { time_range: 'all_time' }, comparar: 'periodo_anterior' }, TODOS, AHORA);
    assert.equal(todo.comparar, false);
    const ok = validarConsulta({ fuente: 'reservas', metrica: 'cantidad', periodo: { time_range: 'current_month' }, comparar: 'periodo_anterior' }, TODOS, AHORA);
    assert.equal(ok.comparar, true);
  });

  test('la conversión ignora el filtro de estado', () => {
    const c = validarConsulta({ fuente: 'cotizaciones', metrica: 'tasa_conversion', filtros: { estado: ['aprobada'] } }, TODOS, AHORA);
    assert.deepEqual(c.filtros.estado, []);
  });
});

describe('constructor: aislamiento por tenant', () => {
  const consulta = (extra) => validarConsulta({ metrica: 'cantidad', agrupar_por: 'ninguno', ...extra }, TODOS, AHORA);

  test('reservas: el primer $match es por mayorista_id, y se repite sobre la cotización', async () => {
    let pipeline;
    mock.method(Reserva, 'aggregate', async (p) => { pipeline = p; return [{ _id: null, valor: 3 }]; });

    const r = await ejecutarConsulta(consulta({ fuente: 'reservas' }), MAYORISTA, AHORA);

    const primero = pipeline[0].$match.mayorista_id;
    assert.ok(primero instanceof mongoose.Types.ObjectId);
    assert.equal(String(primero), MAYORISTA);
    assert.ok(pipeline.some((e) => e.$match && String(e.$match['cot.mayorista_id']) === MAYORISTA));
    assert.equal(r.data[0].valor, 3);
  });

  test('cotizaciones: el primer $match es por mayorista_id', async () => {
    let pipeline;
    mock.method(Cotizacion, 'aggregate', async (p) => { pipeline = p; return []; });
    await ejecutarConsulta(consulta({ fuente: 'cotizaciones' }), MAYORISTA, AHORA);
    assert.equal(String(pipeline[0].$match.mayorista_id), MAYORISTA);
  });

  test('pagos: arranca desde las reservas del tenant (Pago no tiene mayorista_id)', async () => {
    let pipeline;
    mock.method(Reserva, 'aggregate', async (p) => { pipeline = p; return []; });
    await ejecutarConsulta(consulta({ fuente: 'pagos' }), MAYORISTA, AHORA);
    assert.equal(String(pipeline[0].$match.mayorista_id), MAYORISTA);
    assert.ok(pipeline.some((e) => e.$addFields?.estado_pago));
  });

  test('el filtro por agencia busca dentro del tenant y como texto literal', async () => {
    const llamadas = mockFind(Agencia, [{ _id: new mongoose.Types.ObjectId(AGENCIA), nombre: 'Viajes (Sur)' }]);
    let pipeline;
    mock.method(Reserva, 'aggregate', async (p) => { pipeline = p; return [{ _id: null, valor: 1 }]; });

    await ejecutarConsulta(consulta({ fuente: 'reservas', filtros: { agencia: 'Viajes (Sur' } }), MAYORISTA, AHORA);

    assert.equal(String(llamadas[0].mayorista_id), MAYORISTA);
    assert.equal(llamadas[0].nombre.$regex, 'Viajes \\(Sur');
    assert.equal(String(pipeline[0].$match.agencia_id.$in[0]), AGENCIA);
  });

  test('si el nombre no coincide con ninguna agencia, avisa sin consultar', async () => {
    mockFind(Agencia, []);
    const agg = mock.method(Reserva, 'aggregate', async () => []);
    const r = await ejecutarConsulta(consulta({ fuente: 'reservas', filtros: { agencia: 'Inexistente' } }), MAYORISTA, AHORA);
    assert.match(r.aviso, /No encontré ninguna agencia/);
    assert.equal(agg.mock.callCount(), 0);
  });

  test('escaparRegex neutraliza los caracteres especiales', () => {
    assert.equal(escaparRegex('.*[a]'), '\\.\\*\\[a\\]');
  });
});

describe('constructor: períodos', () => {
  test('la semana que viene por fecha de viaje usa fechas de calendario (medianoche UTC)', () => {
    const { desde, hasta } = rangoPeriodo({ time_range: 'next_week' }, 'viaje', AHORA);
    assert.equal(desde.toISOString(), '2026-10-05T00:00:00.000Z');
    assert.equal(hasta.toISOString(), '2026-10-12T00:00:00.000Z');
  });

  test('"este mes" por fecha de viaje toma el mes completo', () => {
    const { desde, hasta } = rangoPeriodo({ time_range: 'current_month' }, 'viaje', AHORA);
    assert.equal(desde.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.equal(hasta.toISOString(), '2026-10-01T00:00:00.000Z');
  });

  test('"este mes" se compara con el mes pasado hasta el mismo día', () => {
    const { desde, hasta } = rangoAnterior({ time_range: 'current_month' }, 'creacion', AHORA);
    assert.equal(desde.toISOString(), '2026-08-01T03:00:00.000Z');
    assert.equal(hasta.toISOString(), '2026-08-30T15:00:00.000Z');
  });

  test('los últimos 7 días se comparan con los 7 anteriores', () => {
    const actual = rangoPeriodo({ time_range: 'last_n_days', days: 7 }, 'creacion', AHORA);
    const previo = rangoAnterior({ time_range: 'last_n_days', days: 7 }, 'creacion', AHORA);
    assert.equal(previo.hasta.getTime() - previo.desde.getTime(), AHORA.getTime() - actual.desde.getTime());
    assert.ok(previo.hasta <= actual.desde || previo.hasta.getTime() - actual.desde.getTime() < 24 * 3600e3);
  });
});

describe('IA: privacidad de los nombres', () => {
  test('los nombres se reemplazan por códigos antes de enviar y se restauran después', () => {
    const { anonimas, mapa } = seudonimizar(
      [{ agencia: 'Viajes Sur', valor: 3 }, { agencia: 'Norte Tour', valor: 1 }],
      { productos: ['Cataratas Full'] },
    );
    assert.deepEqual(anonimas.map((f) => f.agencia), ['AG1', 'AG2']);
    const enviado = ocultarNombres(JSON.stringify({ resumen: 'Encabeza Viajes Sur con Cataratas Full' }), mapa);
    assert.ok(!enviado.includes('Viajes Sur') && !enviado.includes('Cataratas'));
    assert.equal(restaurarNombres('AG1 supera a AG2 con PR1', mapa), 'Viajes Sur supera a Norte Tour con Cataratas Full');
  });

  test('si la IA menciona un código que no existe, la redacción se descarta', () => {
    const { mapa } = seudonimizar([{ agencia: 'Viajes Sur' }]);
    assert.equal(restaurarNombres('AG7 creció mucho', mapa), null);
  });
});
