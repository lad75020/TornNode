'use strict';

function buildMcpUrl(endpoint) {
  const base = String(endpoint || '').replace(/\/$/, '');
  if (/\/(mcp|sse)(\?|$)/.test(base)) return base;
  return `${base}/mcp`;
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
  let sseReader = null;
  let sseBuffer = '';
  let sseSessionUrl = null;
  const auth = apiKey ? `Bearer ${apiKey}` : null;
  const clientInfoFinal = clientInfo || { name: 'tornnode-mcp-client', version: '1.0.0' };
  const isSseTransport = /\/sse(\?|$)/.test(url);

  function withTimeout(promise, timeoutMs, label) {
    if (!timeoutMs || timeoutMs <= 0) return promise;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  }

  function resolveSessionUrl(baseUrl, maybeRelative) {
    if (!maybeRelative) return baseUrl;
    try {
      return new URL(maybeRelative, baseUrl).toString();
    } catch {
      return baseUrl;
    }
  }

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

  async function sseReadNextEvent(timeoutMs) {
    if (!sseReader) throw new Error('SSE reader not initialized');

    while (!sseBuffer.includes('\n\n')) {
      const readResult = await withTimeout(sseReader.read(), timeoutMs, 'sse.read');
      if (!readResult || readResult.done) throw new Error('SSE stream closed');
      sseBuffer += new TextDecoder().decode(readResult.value, { stream: true });
    }

    const splitAt = sseBuffer.indexOf('\n\n');
    const block = sseBuffer.slice(0, splitAt);
    sseBuffer = sseBuffer.slice(splitAt + 2);
    const parsed = parseSse(block);
    return parsed[0] || null;
  }

  async function sseEnsureSession() {
    if (sseReader && sseSessionUrl) return;

    const headers = { Accept: 'text/event-stream' };
    if (auth) headers['Authorization'] = auth;

    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`[HTTP ${res.status}] ${txt}`);
    }
    if (!res.body) throw new Error('SSE body unavailable');

    sseReader = res.body.getReader();
    sseBuffer = '';

    const evt = await sseReadNextEvent(15000);
    if (!evt || evt.event !== 'endpoint') throw new Error('SSE endpoint event missing');

    const endpointPath = typeof evt.data === 'string' ? evt.data : '';
    sseSessionUrl = resolveSessionUrl(url, endpointPath);
  }

  async function sseSend(payload) {
    await sseEnsureSession();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (auth) headers['Authorization'] = auth;

    const res = await fetch(sseSessionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`[HTTP ${res.status}] ${txt}`);
  }

  async function sseWaitJsonRpc(id) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const evt = await sseReadNextEvent(Math.max(1000, deadline - Date.now()));
      if (!evt) continue;
      if (evt.event !== 'message') continue;

      let msg = evt.data;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch { continue; }
      }
      if (!msg || typeof msg !== 'object') continue;
      if (msg.id === id) return msg;
    }
    throw new Error(`[response] timeout for id ${id}`);
  }

  async function call(method, params) {
    const id = `${method}-${Math.random().toString(16).slice(2, 10)}`;
    let msg;

    if (isSseTransport) {
      await sseSend({ jsonrpc: '2.0', id, method, params });
      msg = await sseWaitJsonRpc(id);
    } else {
      const events = await send({ jsonrpc: '2.0', id, method, params });
      msg = findJsonRpcMessage(events, id);
    }

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
