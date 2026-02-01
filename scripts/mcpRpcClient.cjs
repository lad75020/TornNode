'use strict';

function buildMcpUrl(endpoint) {
  const base = String(endpoint || '').replace(/\/$/, '');
  return base.endsWith('/mcp') ? base : `${base}/mcp`;
}

function parseSse(body) {
  const events = [];
  const blocks = String(body || '').split(/\n\n/);
  for (const block of blocks) {
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

function findJsonRpcMessage(events, id) {
  for (const evt of events) {
    const d = evt && evt.data;
    if (d && typeof d === 'object' && d.id === id) return d;
  }
  return null;
}

function createMcpClient({ endpoint, apiKey, clientInfo } = {}) {
  if (!endpoint) throw new Error('MCP endpoint missing');
  const url = buildMcpUrl(endpoint);
  let sessionId = null;
  const auth = apiKey ? `Bearer ${apiKey}` : null;
  const clientInfoFinal = clientInfo || { name: 'tornnode-mcp-client', version: '1.0.0' };

  async function send(payload) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (auth) headers['Authorization'] = auth;
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`[HTTP ${res.status}] ${text}`);
    }
    const nextSession = res.headers.get('mcp-session-id');
    if (nextSession) sessionId = nextSession;
    return parseSse(text);
  }

  async function call(method, params) {
    const id = `${method}-${Math.random().toString(16).slice(2, 10)}`;
    const events = await send({ jsonrpc: '2.0', id, method, params });
    const msg = findJsonRpcMessage(events, id);
    if (!msg) throw new Error(`[${method}] response missing`);
    if (msg.error) throw new Error(`[${method}] ${JSON.stringify(msg.error)}`);
    return msg.result;
  }

  async function initialize() {
    return call('initialize', {
      protocolVersion: '2.0',
      capabilities: {},
      clientInfo: clientInfoFinal
    });
  }

  async function toolsCall(name, args) {
    return call('tools/call', { name, arguments: args || {} });
  }

  return {
    url,
    initialize,
    toolsCall
  };
}

function extractGraphFromReadGraphResult(result) {
  // The gateway returns: { content: [ {type:'text', text:'{ "entities": [...], "relations": [...] }'} ] }
  const content = result && result.content;
  const raw = Array.isArray(content)
    ? content.map(c => (c && c.text) || '').find(Boolean)
    : null;
  if (!raw) throw new Error('read_graph: empty content');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('read_graph: invalid JSON content: ' + err.message);
  }
}

module.exports = {
  buildMcpUrl,
  createMcpClient,
  extractGraphFromReadGraphResult
};
