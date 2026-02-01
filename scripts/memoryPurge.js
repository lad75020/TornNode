#!/usr/bin/env node
/**
 * memoryPurge.js
 * Supprime des entités sur le serveur MCP Memory.
 * Lit memory-diff.json et supprime les "extra" sauf si filtrées.
 *
 * Compatible:
 *  - MCP gateway streamable HTTP (MEMORY_MCP_ENDPOINT=.../mcp)
 *  - Endpoint legacy REST (/delete_entities)
 *
 * Flags:
 *  --dry (ou DRY_RUN=true): liste uniquement, ne nécessite pas d'endpoint.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createMcpClient } = require('./mcpRpcClient.cjs');

async function deleteViaRpc(endpoint, apiKey, entityNames) {
  const client = createMcpClient({
    endpoint,
    apiKey,
    clientInfo: { name: 'memory-purge', version: '1.0.0' }
  });
  await client.initialize();
  await client.toolsCall('delete_entities', { entityNames });
}

async function deleteViaLegacy(endpoint, apiKey, namespace, entityNames) {
  const base = endpoint.replace(/\/$/, '');
  const url = base + '/delete_entities';
  const payload = { entityNames, ...(namespace ? { namespace } : {}) };

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
    throw new Error(`legacy delete fail status=${res.status} body=${txt.slice(0, 300)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry') || process.env.DRY_RUN === 'true';

  const diffPath = path.join(process.cwd(), 'memory-diff.json');
  if (!fs.existsSync(diffPath)) {
    console.error('memory-diff.json absent. Exécutez npm run memory:diff');
    process.exit(2);
  }

  const diff = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
  const extra = diff.extraOnServer || diff.extra || [];
  if (!extra.length) {
    console.log('Aucune entité extra à purger.');
    return;
  }

  const keepIdx = args.indexOf('--keep');
  let keepFragments = [];
  if (keepIdx !== -1 && args[keepIdx + 1]) {
    keepFragments = args[keepIdx + 1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  const toDelete = extra.filter(id => !keepFragments.some(f => id.includes(f)));
  if (!toDelete.length) {
    console.log('Rien à supprimer après filtrage.');
    return;
  }

  console.log(`[purge] Candidates (${toDelete.length})`);
  toDelete.forEach(id => console.log('  delete:', id));

  if (dry) {
    console.log('[purge] Mode dry, arrêt.');
    return;
  }

  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) {
    console.error('MEMORY_MCP_ENDPOINT manquant');
    process.exit(1);
  }

  const namespace = process.env.MEMORY_MCP_NAMESPACE;
  const apiKey = process.env.MEMORY_MCP_API_KEY || '';
  const preferRpc = process.env.MEMORY_MCP_USE_RPC === '1' || /\/mcp(\/|$)/.test(endpoint);

  try {
    if (preferRpc) await deleteViaRpc(endpoint, apiKey, toDelete);
    else await deleteViaLegacy(endpoint, apiKey, namespace, toDelete);

    console.log(`[purge] supprimé ${toDelete.length} entités`);
  } catch (e) {
    console.error('[purge] erreur', e.message);
    process.exit(3);
  }
}

main();
