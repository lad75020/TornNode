#!/usr/bin/env node
/**
 * memoryPurgeRelations.js
 * Supprime des relations orphelines du serveur MCP Memory.
 *
 * Compatible:
 *  - MCP gateway streamable HTTP (MEMORY_MCP_ENDPOINT=.../mcp)
 *  - Endpoint legacy REST (/delete_relations)
 *
 * Flags:
 *  --dry (ou DRY_RUN=true): liste uniquement, ne nécessite pas d'endpoint.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createMcpClient } = require('./mcpRpcClient.cjs');

function loadJson(p) {
  if (!fs.existsSync(p)) {
    console.error('Fichier manquant: ' + p);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function deleteViaRpc(endpoint, apiKey, relations) {
  const client = createMcpClient({
    endpoint,
    apiKey,
    clientInfo: { name: 'memory-relations-purge', version: '1.0.0' }
  });
  await client.initialize();
  await client.toolsCall('delete_relations', { relations });
}

async function deleteViaLegacy(endpoint, apiKey, namespace, relations) {
  const base = endpoint.replace(/\/$/, '');
  const url = base + '/delete_relations';
  const payload = { relations, ...(namespace ? { namespace } : {}) };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`legacy delete_relations fail status=${res.status} body=${txt.slice(0, 300)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry') || process.env.DRY_RUN === 'true';

  const graphsPath = path.join(process.cwd(), 'memory-graphs.json');
  const indexPath = path.join(process.cwd(), 'memory-index.json');
  const graphs = loadJson(graphsPath);
  const index = loadJson(indexPath);

  const indexList = Array.isArray(index.entries)
    ? index.entries
    : Array.isArray(index.entities)
      ? index.entities
      : Array.isArray(index)
        ? index
        : [];

  const localEntities = new Set(indexList.map(e => e.id || e.name).filter(Boolean));
  const relations = graphs.relations || [];

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
  const keepTypeIdx = args.indexOf('--keepRelationType');
  let keepRelationTypes = [];
  if (keepTypeIdx !== -1 && args[keepTypeIdx + 1]) {
    keepRelationTypes = args[keepTypeIdx + 1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  const orphan = relations.filter(r => {
    if (keepRelationTypes.includes(r.relationType)) return false;
    return !localEntities.has(r.from) || !localEntities.has(r.to);
  });

  if (!orphan.length) {
    console.log('Aucune relation orpheline détectée');
    return;
  }

  console.log(`[relations-purge] Orphelines totales: ${orphan.length}`);

  const selected = limit ? orphan.slice(0, limit) : orphan;
  selected.forEach(r => console.log('  drop:', r.from, '--', r.relationType, '-->', r.to));

  if (dry) {
    console.log('[relations-purge] Mode dry, arrêt.');
    return;
  }

  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) {
    console.error('MEMORY_MCP_ENDPOINT manquant');
    process.exit(1);
  }

  const normalized = selected.map(r => ({ from: r.from, to: r.to, relationType: r.relationType }));
  const namespace = process.env.MEMORY_MCP_NAMESPACE;
  const apiKey = process.env.MEMORY_MCP_API_KEY || '';
  const preferRpc = process.env.MEMORY_MCP_USE_RPC === '1' || /\/mcp(\/|$)/.test(endpoint);

  try {
    if (preferRpc) await deleteViaRpc(endpoint, apiKey, normalized);
    else await deleteViaLegacy(endpoint, apiKey, namespace, normalized);

    console.log(`[relations-purge] supprimé ${normalized.length} relations`);
  } catch (e) {
    console.error('[relations-purge] erreur', e.message);
    process.exit(3);
  }
}

main();
