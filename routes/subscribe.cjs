const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

module.exports = async function (fastify, isTest) {
  const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passkey: { type: String, required: true },
    TornAPIKey: { type: String, required: true },
    type: { type: String, default: 'user' },
    id: { type: Number, required: true, unique: true },
    email: { type: String }
  }, { timestamps: true });

  // Reuse existing model if already compiled (Hot reload safe)
  const User = mongoose.models.User || mongoose.model('User', userSchema);

  fastify.post('/subscribe', async (req, reply) => {
    const { username, passkey, TornAPIKey, id } = req.body || {};
    // --- Rate limiting Redis (3 attempts / 60s / IP) ---
    // Clé: rl:sub:<ip>  - incrément atomique + expiry.
    // En cas d'erreur Redis on autorise (fail-open) mais on log un warn.
    const ip = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/[:]/g,'_');
    const key = `rl:sub:${ip}`;
    let current;
    try {
      current = await fastify.redis.incr(key);
      if (current === 1) {
        await fastify.redis.expire(key, 60);
      }
    } catch (e) {
      try { fastify.log.warn({ msg: 'rate-limit redis error', err: e.message }); } catch {}
      current = 1;
    }
    if (current > 3) {
      reply.code(429);
      return reply.send({ success:false, message:'Too many subscribe attempts. Retry later.' });
    }
    // --- End rate limiting ---
    if (!username || !passkey || !TornAPIKey || typeof id !== 'number') {
      return reply.send({ success: false, message: 'Missing required fields (username, passkey, TornAPIKey, id)' });
    }
    // Business validations
    if (typeof TornAPIKey !== 'string' || TornAPIKey.length !== 16) {
      return reply.send({ success: false, message: 'TornAPIKey must be exactly 16 characters' });
    }
    if (!/^\d{7}$/.test(String(id))) {
      return reply.send({ success: false, message: 'id must be exactly 7 digits' });
    }

    try {
      // Connect (idempotent) to sessions DB
      await mongoose.connect(`${isTest?process.env.MONGODB_URI_TEST:process.env.MONGODB_URI}/sessions`);

      const existing = await User.findOne({ $or: [{ username }, { id }] }, { _id: 1 }).lean();
      if (existing) {
        return reply.send({ success: false, message: 'Username or id already exists' });
      }

      // Validate TornAPIKey by calling Torn API (lightweight endpoint)
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 10000);
      try {
        const url = `${process.env.TORN_API_URL}user/personalstats?cat=all`;
        const headers = { 'Authorization': `ApiKey ${TornAPIKey}` };
        const resp = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) {
          return reply.send({ success:false, message:`Torn API key invalid (HTTP ${resp.status})` });
        }
        // Optionally parse minimal JSON for error field
        const json = await resp.json().catch(()=>null);
        if (json && json.error) {
          let errMsg;
          if (typeof json.error === 'string') errMsg = json.error;
          else if (json.error && typeof json.error.error === 'string') errMsg = json.error.error; // nested pattern
          else if (json.error && typeof json.error.code !== 'undefined') errMsg = `code ${json.error.code}`;
            else {
              try { errMsg = JSON.stringify(json.error).slice(0,180); } catch { errMsg = 'Unknown'; }
            }
          return reply.send({ success:false, message:`Torn API key error: ${errMsg}` });
        }
      } catch(apiErr) {
        return reply.send({ success:false, message:`Torn API validation failed: ${apiErr.name==='AbortError'?'timeout':apiErr.message}` });
      }

      const hash = await bcrypt.hash(passkey, 10);
      await User.create({ username, passkey: hash, TornAPIKey, id });
      return reply.send({ success: true });
    } catch (e) {
      return reply.send({ success: false, message: e.message });
    }
  });
};
