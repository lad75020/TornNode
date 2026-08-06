'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCooldownService } = require('../routes/authSession.cjs');
const { createClock, createRedis } = require('./helpers/authTestHarness.cjs');

test('five failures lock both normalized account and network for exactly 900 seconds', async () => {
  const clock = createClock(); const redis = createRedis(clock);
  const cooldown = createCooldownService({ redis, secret: 'unit-test-digest-secret' });
  for (let attempt = 0; attempt < 5; attempt += 1) await cooldown.failure(' Alice ', '127.0.0.1');
  assert.equal(await cooldown.isBlocked('alice', 'different-network'), true);
  assert.equal(await cooldown.isBlocked('another', '127.0.0.1'), true);
  assert.equal(await redis.ttl(cooldown.key('account', 'alice')), 900);
  clock.advance(900_000);
  assert.equal(await cooldown.isBlocked('alice', '127.0.0.1'), false);
});
