'use strict';

function createClock(start = 0) {
  let value = start;
  return { now: () => value, advance: (milliseconds) => { value += milliseconds; return value; } };
}

function createRedis(clock = createClock()) {
  const values = new Map();
  const expiresAt = new Map();
  const available = () => true;
  const check = (key) => {
    if (expiresAt.has(key) && expiresAt.get(key) <= clock.now()) { values.delete(key); expiresAt.delete(key); }
  };
  return {
    values, clock,
    async get(key) { check(key); return values.get(key) ?? null; },
    async del(...keys) { keys.forEach((key) => { values.delete(key); expiresAt.delete(key); }); return keys.length; },
    async expire(key, seconds) { check(key); if (!values.has(key)) return 0; expiresAt.set(key, clock.now() + seconds * 1000); return 1; },
    async ttl(key) { check(key); return expiresAt.has(key) ? Math.ceil((expiresAt.get(key) - clock.now()) / 1000) : -2; },
    async eval(_script, { keys, arguments: args }) { const key = keys[0]; check(key); const count = Number(values.get(key) || 0) + 1; values.set(key, String(count)); if (count === 1) expiresAt.set(key, clock.now() + Number(args[0]) * 1000); return count; }
  };
}

function socketHarness() {
  const frames = []; let closedArgs;
  return { frames, get closedArgs() { return closedArgs; }, send: (frame) => frames.push(frame), close: (...args) => { closedArgs = args; } };
}

module.exports = { createClock, createRedis, socketHarness };
