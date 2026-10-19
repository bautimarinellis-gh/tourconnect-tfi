const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { getIp } = require('../utils/auditService');

// Misma configuración que index.js: un único proxy de confianza (Nginx).
const app = express();
app.set('trust proxy', 1);
app.get('/ip', (req, res) => res.json({ ip: getIp(req) }));

const server = app.listen(0);
after(() => server.close());

const pedirIp = async (xff) => {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/ip`, {
    headers: xff ? { 'X-Forwarded-For': xff } : {},
  });
  return (await res.json()).ip;
};

test('usa la IP que agregó el proxy, no la que inventa el cliente', async () => {
  // El cliente manda "1.2.3.4"; Nginx agrega la IP real (5.6.7.8) al final.
  assert.equal(await pedirIp('1.2.3.4, 5.6.7.8'), '5.6.7.8');
});

test('sin proxy de por medio, usa la IP de la conexión', async () => {
  assert.match(await pedirIp(null), /127\.0\.0\.1$/);
});
