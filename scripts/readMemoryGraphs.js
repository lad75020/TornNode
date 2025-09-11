#!/usr/bin/env node
/**
 * readMemoryGraphs.js
 * Récupère les graphes / entités depuis le serveur MCP Memory.
 *
 * Env attendus:
 *  MEMORY_MCP_ENDPOINT (ex: https://memory.local/api)
 *  MEMORY_MCP_NAMESPACE (optionnel filtre)
 *  MEMORY_MCP_API_KEY (optionnel)
 *  MEMORY_MCP_PATH_READ (override chemin, défaut: /read_graphs ou /graphs)
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) {
    console.error('MEMORY_MCP_ENDPOINT manquant');
    process.exit(1);
  }
  const base = endpoint.replace(/\/$/, '');
  const namespace = process.env.MEMORY_MCP_NAMESPACE;
  const apiKey = process.env.MEMORY_MCP_API_KEY;
  const custom = process.env.MEMORY_MCP_PATH_READ;
  const candidates = [
    '/read_graph'
  ].filter(Boolean);

  // Argument simple --id <fragment>
  const argIndex = process.argv.indexOf('--id');
  const idFilter = argIndex !== -1 ? process.argv[argIndex + 1] : null;

  for (const c of candidates) {
    const baseUrl = base + c;
    const url = baseUrl + (namespace ? `?namespace=${encodeURIComponent(namespace)}` : '');
    // Tentative GET
    try {
      console.log(`[memory:read] TRY GET ${c}`);
      const res = await fetch(url, { headers: { 'Accept': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) } });
      if (res.ok) {
        const json = await res.json();
        let data = json;
        if (idFilter) {
          const arr = Array.isArray(json) ? json : (json.entities || json.graphs || json.items || []);
            data = arr.filter(e => typeof e.id === 'string' && e.id.includes(idFilter));
        }
        const out = path.join(process.cwd(), 'memory-graphs.json');
        fs.writeFileSync(out, JSON.stringify(data, null, 2));
        console.log(`[memory:read] success GET path=${c} -> ${out} (count=${Array.isArray(data)?data.length:'n/a'})`);
        return;
      } else {
        const txt = await res.text();
        console.warn(`[memory:read] fail GET path=${c} status=${res.status} body=${txt.slice(0,160)}`);
      }
    } catch (e) {
      console.warn('[memory:read] error GET path=' + c + ' err=' + e.message);
    }

    // Fallback POST (certains serveurs attendent le namespace en body)
    try {
      console.log(`[memory:read] TRY POST ${c}`);
      const resP = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ namespace })
      });
      if (resP.ok) {
        const json = await resP.json();
        let data = json;
        if (idFilter) {
          const arr = Array.isArray(json) ? json : (json.entities || json.graphs || json.items || []);
          data = arr.filter(e => typeof e.id === 'string' && e.id.includes(idFilter));
        }
        const out = path.join(process.cwd(), 'memory-graphs.json');
        fs.writeFileSync(out, JSON.stringify(data, null, 2));
        console.log(`[memory:read] success POST path=${c} -> ${out} (count=${Array.isArray(data)?data.length:'n/a'})`);
        return;
      } else {
        const txt = await resP.text();
        console.warn(`[memory:read] fail POST path=${c} status=${resP.status} body=${txt.slice(0,160)}`);
      }
    } catch (e) {
      console.warn('[memory:read] error POST path=' + c + ' err=' + e.message);
    }
  }
  console.error('[memory:read] aucun endpoint n\'a répondu avec succès');
  process.exit(2);
}

main();
