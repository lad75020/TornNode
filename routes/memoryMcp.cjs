const DEFAULT_ENDPOINT = 'http://192.168.1.80:3176/mcp';
const CACHE_TTL_MS = Number(process.env.MEMORY_MCP_CACHE_TTL_MS || 15000);

const cache = new Map();

function buildMcpUrl(endpoint) {
  if (!endpoint) return DEFAULT_ENDPOINT;
  return endpoint.endsWith('/mcp') ? endpoint : `${endpoint.replace(/\/$/, '')}/mcp`;
}

function parseSse(body) {
  const events = [];
  for (const block of body.split(/\n\n/)) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines = [];
    for (const line of block.split(/\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    const joined = dataLines.join('\n');
    try {
      events.push({ event, data: JSON.parse(joined) });
    } catch {
      events.push({ event, data: joined });
    }
  }
  return events;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function rpcSend(url, payload, apiKey, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) }, 15000);
  const text = await res.text();
  if (!res.ok) throw new Error(`[HTTP ${res.status}] ${text.slice(0, 400)}`);
  const contentType = res.headers.get('content-type') || '';
  let events;
  if (contentType.includes('text/event-stream')) {
    events = parseSse(text);
  } else {
    try {
      const json = JSON.parse(text);
      events = [{ event: 'message', data: json }];
    } catch {
      events = parseSse(text);
    }
  }
  const newSession = res.headers.get('mcp-session-id') || sessionId;
  return { events, sessionId: newSession };
}

async function rpcCall(url, method, params, apiKey, sessionId, suffix) {
  const id = `${method}-${suffix || ''}${Math.random().toString(16).slice(2, 8)}`;
  const { events, sessionId: nextSession } = await rpcSend(
    url,
    { jsonrpc: '2.0', id, method, params },
    apiKey,
    sessionId
  );
  const message = events.map((e) => e.data).find((data) => data && data.id === id);
  if (!message) throw new Error(`[${method}] reponse introuvable`);
  if (message.error) throw new Error(`[${method}] ${JSON.stringify(message.error)}`);
  return { result: message.result, sessionId: nextSession };
}

async function readGraph(endpoint, namespace, apiKey) {
  const url = buildMcpUrl(endpoint);
  let sessionId = null;
  const init = await rpcCall(
    url,
    'initialize',
    { protocolVersion: '2.0', capabilities: {}, clientInfo: { name: 'tornnode-memory-ui', version: '1.0.0' } },
    apiKey,
    sessionId,
    'init'
  );
  sessionId = init.sessionId;
  const args = namespace ? { namespace } : {};
  const call = await rpcCall(
    url,
    'tools/call',
    { name: 'read_graph', arguments: args },
    apiKey,
    sessionId,
    'read'
  );
  const content = call.result && call.result.content ? call.result.content : [];
  const raw = content.map((item) => item.text || item.json || item.data || '').find(Boolean);
  if (!raw) throw new Error('contenu MCP vide');
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON MCP invalide: ${err.message}`);
  }
}

module.exports = async function memoryMcpRoutes(fastify) {
  fastify.get('/api/memory/graphs', async (req, reply) => {
    const namespace = typeof req.query?.namespace === 'string' ? req.query.namespace.trim() : '';
    const force = req.query?.force === '1' || req.query?.force === 'true';
    const cacheKey = namespace || '__all__';
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.payload;
    }

    const endpoint = process.env.MEMORY_MCP_ENDPOINT || DEFAULT_ENDPOINT;
    const apiKey = process.env.MEMORY_MCP_API_KEY;
    if (!endpoint) return reply.code(500).send({ error: 'MEMORY_MCP_ENDPOINT manquant' });
    if (!apiKey) return reply.code(500).send({ error: 'MEMORY_MCP_API_KEY manquant' });

    try {
      const payload = await readGraph(endpoint, namespace || null, apiKey);
      const response = {
        source: endpoint,
        namespace: namespace || null,
        fetchedAt: new Date().toISOString(),
        data: payload
      };
      cache.set(cacheKey, { timestamp: now, payload: response });
      return response;
    } catch (err) {
      return reply.code(502).send({ error: 'MCP fetch failed', details: err.message });
    }
  });
};
