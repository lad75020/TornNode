#!/usr/bin/env node
/**
 * readMemoryGraphs.js
 * Récupère les graphes / entités depuis le serveur MCP Memory.
 *
 * Modes:
 *  - JSON-RPC (streamable HTTP) si MEMORY_MCP_ENDPOINT finit par /mcp ou si MEMORY_MCP_USE_RPC=1
 *  - Fallback HTTP legacy (/read_graph) sinon
 *
 * Env:
 *  MEMORY_MCP_ENDPOINT (ex: http://192.168.1.80:3176/mcp)
 *  MEMORY_MCP_NAMESPACE (optionnel)
 *  MEMORY_MCP_API_KEY (optionnel)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createMcpClient, extractGraphFromReadGraphResult } = require('./mcpRpcClient.cjs');

async function readViaRpc(endpoint, namespace, apiKey) {
  const client = createMcpClient({
    endpoint,
    apiKey,
    clientInfo: { name: 'memory-read-script', version: '1.0.0' }
  });
  await client.initialize();
  const args = namespace ? { namespace } : {};
  const res = await client.toolsCall('read_graph', args);
  return extractGraphFromReadGraphResult(res);
}

async function readViaLegacy(endpoint, namespace, apiKey) {
  const base = endpoint.replace(/\/$/, '');
  const candidates = ['/read_graph'];

  for (const c of candidates) {
    const baseUrl = base + c;
    const url = baseUrl + (namespace ? `?namespace=${encodeURIComponent(namespace)}` : '');

    // GET
    try {
      console.log(`[memory:read] TRY GET ${c}`);
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        }
      });
      if (res.ok) return res.json();
      const txt = await res.text();
      console.warn(`[memory:read] fail GET path=${c} status=${res.status} body=${txt.slice(0, 160)}`);
    } catch (e) {
      console.warn('[memory:read] error GET path=' + c + ' err=' + e.message);
    }

    // POST
    try {
      console.log(`[memory:read] TRY POST ${c}`);
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ namespace })
      });
      if (res.ok) return res.json();
      const txt = await res.text();
      console.warn(`[memory:read] fail POST path=${c} status=${res.status} body=${txt.slice(0, 160)}`);
    } catch (e) {
      console.warn('[memory:read] error POST path=' + c + ' err=' + e.message);
    }
  }

  throw new Error('aucun endpoint legacy n\'a répondu avec succès');
}

async function main() {
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) {
    console.error('MEMORY_MCP_ENDPOINT manquant');
    process.exit(1);
  }

  const namespace = process.env.MEMORY_MCP_NAMESPACE;
  const apiKey = process.env.MEMORY_MCP_API_KEY;

  // Argument simple --id <fragment>
  const args = process.argv.slice(2);
  const argIndex = args.indexOf('--id');
  const idFilter = argIndex !== -1 ? args[argIndex + 1] : null;

  const preferRpc = process.env.MEMORY_MCP_USE_RPC === '1' || /\/mcp(\/|$)/.test(endpoint);

  let data;
  if (preferRpc) {
    data = await readViaRpc(endpoint, namespace, apiKey);
    console.log('[memory:read] success MCP');
  } else {
    data = await readViaLegacy(endpoint, namespace, apiKey);
    console.log('[memory:read] success legacy');
  }

  // Normaliser filtrage
  if (idFilter) {
    const arr = Array.isArray(data) ? data : (data.entities || data.graphs || data.items || []);
    data = arr.filter(e => typeof e.id === 'string' && e.id.includes(idFilter));
  }

  const out = path.join(process.cwd(), 'memory-graphs.json');
  fs.writeFileSync(out, JSON.stringify(data, null, 2));

  const count = Array.isArray(data) ? data.length : (Array.isArray(data.entities) ? data.entities.length : 'n/a');
  console.log(`[memory:read] écrit ${out} (count=${count})`);
}

main().catch(err => {
  console.error('[memory:read] erreur', err.message);
  process.exit(2);
});
