'use strict';

const bcrypt = require('bcrypt');

async function syntheticUser() {
  return {
    id: 424242,
    username: 'auth-test-user',
    passkey: await bcrypt.hash('synthetic-passkey', 10),
    type: 'test',
    TornAPIKey: 'synthetic-test-context-only'
  };
}

function redisNamespace() {
  return `auth-test:${process.pid}:${Date.now()}:`;
}

module.exports = { syntheticUser, redisNamespace };
