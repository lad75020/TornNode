const bcrypt = require('bcrypt');
const { User, connectSessionsDb } = require('../utils/userModel.cjs');

module.exports = async function (fastify, isTest) {
  fastify.post('/subscribe', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const { username, passkey, TornAPIKey, id } = req.body || {};
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
      await connectSessionsDb(isTest ? process.env.MONGODB_URI_TEST : process.env.MONGODB_URI);

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
