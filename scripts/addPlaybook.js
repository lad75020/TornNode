#!/usr/bin/env node
/**
 * addPlaybook.js
 * Crée une entité "playbook" (guide opérationnel) et la pousse sur le serveur mémoire.
 *
 * Compatible:
 *  - MCP gateway streamable HTTP (MEMORY_MCP_ENDPOINT=.../mcp)
 *  - Endpoint legacy REST (create_entities)
 */

'use strict';

const fs = require('fs');
const { createMcpClient } = require('./mcpRpcClient.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { steps: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--title') out.title = args[++i];
    else if (a === '--step') out.steps.push(args[++i]);
    else if (a === '--steps-file') out.stepsFile = args[++i];
    else if (a === '--tag') {
      out.tags = out.tags || [];
      out.tags.push(args[++i]);
    } else if (a === '--why') out.why = args[++i];
    else if (a === '--id') out.id = args[++i];
    else if (a === '--dry') out.dry = true;
  }
  return out;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function pushViaRpc(endpoint, apiKey, entity) {
  const client = createMcpClient({
    endpoint,
    apiKey,
    clientInfo: { name: 'playbook-uploader', version: '1.0.0' }
  });
  await client.initialize();
  await client.toolsCall('create_entities', { entities: [entity] });
}

async function pushViaLegacy(endpoint, apiKey, namespace, entity) {
  const base = endpoint.replace(/\/$/, '');
  const pathEndpoint = process.env.MEMORY_MCP_PATH || '/create_entities';

  const res = await fetch(base + pathEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ namespace, entities: [entity] })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`legacy push fail status=${res.status} body=${t.slice(0, 400)}`);
  }
}

async function main() {
  const argv = parseArgs();
  const { title, stepsFile, why, id } = argv;
  let { steps } = argv;

  if (!title) {
    console.error('--title requis');
    process.exit(1);
  }

  if (stepsFile) {
    try {
      const content = fs.readFileSync(stepsFile, 'utf8');
      content
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
        .forEach(l => steps.push(l));
    } catch (e) {
      console.warn('Impossible de lire steps-file', e.message);
    }
  }

  if (steps.length === 0) {
    console.error('Aucune étape (--step ou --steps-file)');
    process.exit(1);
  }

  const slug = id || `playbook:${slugify(title)}`;
  const namespace = process.env.MEMORY_MCP_NAMESPACE || 'tornnode';

  const summary = `Playbook: ${title}` + (why ? ` — ${why}` : '');
  const observations = [summary, ...steps.map((s, i) => `Étape ${i + 1}: ${s}`)];

  const entity = {
    id: slug,
    name: slug,
    entityType: 'playbook',
    tags: ['playbook', 'guide', ...(argv.tags || []), `namespace:${namespace}`],
    summary,
    description: summary,
    observations,
    content: steps.join('\n'),
    steps,
    why
  };

  const dry = argv.dry || process.env.DRY_RUN === 'true';
  if (dry) {
    console.log('[playbook][dry-run]', JSON.stringify(entity, null, 2));
    return;
  }

  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) {
    console.error('MEMORY_MCP_ENDPOINT non défini');
    process.exit(2);
  }

  const apiKey = process.env.MEMORY_MCP_API_KEY || '';
  const preferRpc = process.env.MEMORY_MCP_USE_RPC === '1' || /\/mcp(\/|$)/.test(endpoint);

  try {
    if (preferRpc) await pushViaRpc(endpoint, apiKey, entity);
    else await pushViaLegacy(endpoint, apiKey, namespace, entity);

    console.log(`[playbook] créé et poussé ${slug}`);
  } catch (e) {
    console.error('[playbook] échec', e.message);
    process.exit(3);
  }
}

main();
