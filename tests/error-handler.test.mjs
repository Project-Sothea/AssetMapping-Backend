import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import express from 'express';

import { errorHandler } from '../dist/middleware/errorHandler.js';
import { AppError } from '../dist/types/index.js';

test('failed requests reach the JSON error middleware rather than the Express HTML fallback', async () => {
  const app = express();
  app.get('/probe', (_req, _res, next) => next(new Error('Choose a village before saving.')));
  app.get('/invalid-pin', (_req, _res, next) => next(new AppError(400, 'Choose a village.')));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/probe`);
    assert.equal(response.status, 500);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'Choose a village before saving.');
    const validation = await fetch(`http://127.0.0.1:${server.address().port}/invalid-pin`);
    assert.equal(validation.status, 400);
    assert.equal((await validation.json()).error, 'Choose a village.');
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
