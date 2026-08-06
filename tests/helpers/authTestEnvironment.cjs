'use strict';

/** Isolated values only.  Tests may override any value through their own env. */
module.exports = Object.freeze({
  mongoUri: process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27018/tornnode_auth_test',
  redisUrl: process.env.REDIS_URL_TEST || 'redis://127.0.0.1:16379',
  origin: process.env.AUTH_TEST_ORIGIN || 'http://127.0.0.1:3104',
  sessionSecret: process.env.SESSION_SECRET || 'test-only-session-secret-must-be-at-least-32-characters',
  cooldownDigestSecret: process.env.AUTH_COOLDOWN_DIGEST_SECRET || 'test-only-cooldown-digest-secret',
  cookieSecure: process.env.AUTH_TEST_COOKIE_SECURE === 'true'
});
