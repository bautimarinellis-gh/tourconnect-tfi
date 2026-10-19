const { test } = require('node:test');
const assert = require('node:assert/strict');

const { hoyDateString, toDateString } = require('../utils/dateHelpers');

test('"hoy" es el día de Argentina aunque en UTC ya sea mañana', () => {
  // 23:30 del 24/09 en Argentina = 02:30 del 25/09 en UTC.
  assert.equal(hoyDateString(new Date('2026-09-25T02:30:00Z')), '2026-09-24');
});

test('pasada la medianoche argentina, ya es el día siguiente', () => {
  // 00:30 del 25/09 en Argentina = 03:30 UTC.
  assert.equal(hoyDateString(new Date('2026-09-25T03:30:00Z')), '2026-09-25');
});

test('las fechas de calendario guardadas a medianoche UTC conservan su día', () => {
  assert.equal(toDateString(new Date('2026-12-10T00:00:00Z')), '2026-12-10');
  assert.equal(toDateString('2026-12-10'), '2026-12-10');
});
