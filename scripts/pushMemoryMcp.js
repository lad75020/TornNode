#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createMcpClient } = require('./mcpRpcClient.cjs');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'memory-index.json');

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('[memory:mcp] memory-index.json absent. Exécutez npm run memory:index');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

function mapEntity(entry, namespace) {
  const tags = Array.from(new Set([...(entry.tags || []), `namespace:${namespace}`]));
  const summary = entry.summary || entry.id;
  return {
    id: entry.id,
    name: entry.id,
    entityType: entry.kind || 'generic',
    tags,
    summary,
    description: summary,
    kind: entry.kind,
    file: entry.file,
    hash: entry.hash,
    lastTouched: entry.lastTouched,
    text: `${summary} | types=${(entry.types || []).join(',')} | flags=${(entry.socketFlags || []).join(',')}`.trim(),
    content: summary,
    observations: summary ? [summary] : [],
    data: entry
  };
}

async function main() {
  if (process.env.DRY_RUN === 'true') {
    console.log('[memory:mcp] DRY_RUN actif, saut du push');
    return;
  }

  const endpoint = process.env.MEMORY_MCP_ENDPOINT || '';
  if (!endpoint) {
    console.log('[memory:mcp] MEMORY_MCP_ENDPOINT non défini, saut du push');
    return;
  }

  const namespace = process.env.MEMORY_MCP_NAMESPACE || 'tornnode';
  const apiKey = process.env.MEMORY_MCP_API_KEY || '';
  const chunkSize = Number(process.env.MEMORY_MCP_CHUNK_SIZE || '12');

  const index = loadIndex();
  const entries = index.entries || [];
  if (!entries.length) {
    console.log('[memory:mcp] aucune entrée à pousser');
    return;
  }

  const client = createMcpClient({
    endpoint,
    apiKey,
    clientInfo: { name: 'memory-push-script', version: '1.0.0' }
  });

  console.log(`[memory:mcp] pushing ${entries.length} entrées vers ${client.url}`);
  await client.initialize();

  const chunks = [];
  for (let i = 0; i < entries.length; i += chunkSize) chunks.push(entries.slice(i, i + chunkSize));

  let pushed = 0;
  for (let i = 0; i < chunks.length; i++) {
    const entities = chunks[i].map(e => mapEntity(e, namespace));
    await client.toolsCall('create_entities', { entities });
    pushed += entities.length;
    console.log(`[memory:mcp] chunk ${i + 1}/${chunks.length} ok (${entities.length} entities)`);
  }

  console.log(`[memory:mcp] push terminé success=${pushed}/${entries.length}`);
}

main().catch(err => {
  console.error('[memory:mcp] erreur', err.message);
  process.exit(1);
});
