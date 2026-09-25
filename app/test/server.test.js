import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  process.env.LOG_LEVEL = 'error';
  const app = createApp({ version: 'test-version' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

test('GET /api/health returns ok with the deployed version', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.version, 'test-version');
});

test('unknown API routes return a JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});

test('the single page application is served on any route', async () => {
  const response = await fetch(`${baseUrl}/goals`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
});

test('security headers are set', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.ok(response.headers.get('content-security-policy'));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
});
