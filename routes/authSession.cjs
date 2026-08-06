  return { validateAndRenew, establish, renew, destroy, registerSocket, clearCookie, cookieOptions };
}

function createCooldownService({ redis, secret, now = () => Date.now() } = {}) {
  const digest = (value) => crypto.createHmac('sha256', secret || '').update(String(value).trim().toLocaleLowerCase('en-US')).digest('hex');
  const key = (scope, value) => `auth:failure:${scope}:${digest(value)}`;
  async function isBlocked(account, network) {
    try {
      const values = await Promise.all([redis.get(key('account', account)), redis.get(key('network', network))]);
      return values.some((value) => Number(value) >= 5);
    } catch (_) { throw new Error('cooldown unavailable'); }
  }
  async function failure(account, network) {
    try {
      for (const candidate of [key('account', account), key('network', network)]) {
        // INCR plus first-write expiry must be one Redis operation: a process
        // crash between separate commands would otherwise create a permanent key.
        await redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
          { keys: [candidate], arguments: ['900'] }
        );
      }
    } catch (_) { throw new Error('cooldown unavailable'); }
  }
  async function clear(account, network) { await Promise.all([redis.del(key('account', account)), redis.del(key('network', network))]); }
  return { isBlocked, failure, clear, key, now };
}

module.exports = { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, COOKIE_OPTIONS, createSessionService, createCooldownService };
