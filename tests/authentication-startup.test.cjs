'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

test('isolated Fastify application boots and serves the built SPA without Vite initialization errors', async (t) => {
  const child = spawn(process.execPath, ['server.cjs', '--test', '--host', '127.0.0.1', '--port', '39105'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      MONGODB_URI_TEST: 'mongodb://127.0.0.1:27017/tornnode_auth_test',
      REDIS_URL_TEST: process.env.REDIS_URL_TEST || 'redis://127.0.0.1:6379/15',
      SESSION_SECRET: 'test-only-session-secret-must-be-at-least-32-characters',
      AUTH_COOLDOWN_DIGEST_SECRET: 'test-only-cooldown-digest-secret',
      FASTIFY_LOG_LEVEL: 'info'
    }
  });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const result = await new Promise((resolve) => {
    let timeout;
    let observer;
    const finish = (value) => {
      clearTimeout(timeout);
      clearInterval(observer);
      resolve(value);
    };
    timeout = setTimeout(() => finish('timeout'), 8_000);
    child.once('exit', (code) => finish(`exit:${code}`));
    observer = setInterval(() => {
      if (output.includes('Server running at')) finish('ready');
    }, 25);
  });
  assert.equal(result, 'ready', output);
  assert.doesNotMatch(output, /Cannot read properties of null \(reading 'fastify'\)/);
  const response = await fetch('http://127.0.0.1:39105/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="root"><\/div>/);
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
});
