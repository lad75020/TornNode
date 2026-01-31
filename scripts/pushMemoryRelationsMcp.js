#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createMcpClient } = require('./mcpRpcClient.cjs');

const ROOT = path.resolve(__dirname, '..');
const REL_PATH = path.join(ROOT, 'memory-relations.json');

function loadRelations() {
  if (!fs.existsSync(REL_PATH)) {
    console.error('[memory:relations:mcp] memory-relations.json absent. Exécutez d\'abord npm run memory:relations (génération).');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(REL_PATH, 'utf8'));
  const relations = json.relations || [];
  if (!relations.length) {
    console.log('[memory:relations:mcp] aucune relation à pousser');
    process.exit(0);
  }
  return relations;
}

async function main() {
  if (process.env.DRY_RUN === 'true') {
    console.log('[memory:relations:mcp] DRY_RUN actif, saut du push');
    return;
  }

  const endpoint = process.env.MEMORY_MCP_ENDPOINT || '';
  if (!endpoint) {
    console.log('[memory:relations:mcp] MEMORY_MCP_ENDPOINT non défini, saut du push');
    return;
  }

  const apiKey = process.env.MEMORY_MCP_API_KEY || '';
  const chunkSize = Number(process.env.MEMORY_MCP_REL_CHUNK_SIZE || '40');

  const relations = loadRelations();
  const client = createMcpClient({
    endpoint,
    apiKey,
    clientInfo: { name: 'memory-relations-push', version: '1.0.0' }
  });

  console.log(`[memory:relations:mcp] pushing ${relations.length} relations vers ${client.url}`);
  await client.initialize();

  const chunks = [];
  for (let i = 0; i < relations.length; i += chunkSize) chunks.push(relations.slice(i, i + chunkSize));

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].map(r => ({
      from: r.from,
      to: r.to,
      relationType: r.relationType
    }));
    await client.toolsCall('create_relations', { relations: chunk });
    console.log(`[memory:relations:mcp] chunk ${i + 1}/${chunks.length} ok (${chunk.length} relations)`);
  }

  console.log('[memory:relations:mcp] push terminé');
}

main().catch(err => {
  console.error('[memory:relations:mcp] erreur', err.message);
  process.exit(1);
});
