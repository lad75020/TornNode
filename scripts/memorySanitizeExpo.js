#!/usr/bin/env node
/**
 * memorySanitizeExpo.js
 *
 * Objectif: Purger ou nettoyer toutes les références résiduelles à l'ancien dossier Expo dans MCP Memory.
 *
 * Compatible:
 *  - MCP gateway streamable HTTP (MEMORY_MCP_ENDPOINT=.../mcp)
 *  - Endpoint legacy REST (read_graph/delete_entities/create_entities)
 */

'use strict';

const { argv, env } = process;
const { createMcpClient, extractGraphFromReadGraphResult } = require('./mcpRpcClient.cjs');

function parseArgs() {
  const args = { mode: 'delete', dryRun: false, include: null, exclude: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode' && argv[i + 1]) args.mode = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--include' && argv[i + 1]) args.include = new RegExp(argv[++i]);
    else if (a === '--exclude' && argv[i + 1]) args.exclude = new RegExp(argv[++i]);
    else if (a === '--help') args.help = true;
  }
  if (env.MEMORY_SANITIZE_DRY_RUN === '1') args.dryRun = true;
  return args;
}

function detectExpoEntities(graph, includeRe, excludeRe) {
  const targets = [];
  const expoRe = /Expo/ig;
  for (const e of graph.entities || []) {
    const haystack = [
      e.id || e.name,
      e.name,
      e.content,
      e.text,
      ...(e.observations || [])
    ]
      .filter(Boolean)
      .join('\n');

    expoRe.lastIndex = 0;
    if (expoRe.test(haystack)) {
      if (includeRe && !includeRe.test(haystack)) continue;
      if (excludeRe && excludeRe.test(haystack)) continue;
      targets.push(e);
    }
  }
  return targets;
}

function scrubString(s) {
  return String(s).replace(/Expo\/?/g, 'client/');
}

function scrubEntity(e) {
  const out = { ...e };
  if (out.name) out.name = scrubString(out.name);
  if (out.id) out.id = scrubString(out.id);
  if (Array.isArray(out.observations)) out.observations = out.observations.map(scrubString);
  if (out.content) out.content = scrubString(out.content);
  if (out.text) out.text = scrubString(out.text);
  return out;
}

async function readGraphLegacy(endpoint, namespace, apiKey) {
  const base = endpoint.replace(/\/$/, '');
  const res = await fetch(base + '/read_graph', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ namespace })
  });
  if (!res.ok) throw new Error('read_graph failed status=' + res.status);
  return res.json();
}

async function deleteEntitiesLegacy(endpoint, namespace, apiKey, ids) {
  const base = endpoint.replace(/\/$/, '');
  const res = await fetch(base + '/delete_entities', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ namespace, entityNames: ids })
  });
  if (!res.ok) throw new Error('delete_entities failed status=' + res.status);
  return res.text();
}

async function createEntitiesLegacy(endpoint, namespace, apiKey, entities) {
  const base = endpoint.replace(/\/$/, '');
  const res = await fetch(base + '/create_entities', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ namespace, entities })
  });
  if (!res.ok) throw new Error('create_entities failed status=' + res.status);
  return res.text();
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node scripts/memorySanitizeExpo.js --mode <delete|scrub> [--dry-run] [--include <regex>] [--exclude <regex>]');
    process.exit(0);
  }

  if (env.DRY_RUN === 'true') {
    console.log('[sanitize] DRY_RUN actif: skip réseau.');
    return;
  }

  const endpointEnv = env.MEMORY_MCP_ENDPOINT;
  const endpoint = (endpointEnv || 'http://127.0.0.1:9111/memory').replace(/\/$/, '');
  if (args.dryRun && !endpointEnv) {
    console.log('[sanitize] DRY RUN sans MEMORY_MCP_ENDPOINT explicite: skip réseau.');
    return;
  }
  const namespace = env.MEMORY_MCP_NAMESPACE || 'tornnode';
  const apiKey = env.MEMORY_MCP_API_KEY || '';
  const preferRpc = env.MEMORY_MCP_USE_RPC === '1' || /\/mcp(\/|$)/.test(endpoint);

  console.log(`[sanitize] Endpoint=${endpoint} namespace=${namespace} mode=${args.mode} dryRun=${args.dryRun}`);

  let graph;
  if (preferRpc) {
    const client = createMcpClient({
      endpoint,
      apiKey,
      clientInfo: { name: 'memory-sanitize-expo', version: '1.0.0' }
    });
    await client.initialize();
    const readRes = await client.toolsCall('read_graph', { namespace });
    graph = extractGraphFromReadGraphResult(readRes);
  } else {
    graph = await readGraphLegacy(endpoint, namespace, apiKey);
  }

  const targets = detectExpoEntities(graph, args.include, args.exclude);
  if (!targets.length) {
    console.log('[sanitize] Aucune entité contenant "Expo" détectée. Rien à faire.');
    return;
  }

  console.log(`[sanitize] ${targets.length} entité(s) ciblée(s):`);
  targets.forEach(e => console.log(' - ' + (e.id || e.name)));

  if (args.dryRun) {
    console.log('[sanitize] DRY RUN activé: aucune modification envoyée.');
    return;
  }

  const ids = targets.map(e => e.id || e.name).filter(Boolean);

  if (args.mode === 'delete') {
    console.log('[sanitize] Suppression...');
    if (preferRpc) {
      const client = createMcpClient({ endpoint, apiKey, clientInfo: { name: 'memory-sanitize-expo', version: '1.0.0' } });
      await client.initialize();
      await client.toolsCall('delete_entities', { entityNames: ids });
    } else {
      await deleteEntitiesLegacy(endpoint, namespace, apiKey, ids);
    }
  } else if (args.mode === 'scrub') {
    console.log('[sanitize] Mode scrub: suppression puis recréation entités nettoyées');
    const sanitized = targets.map(scrubEntity);

    const payload = sanitized.map(e => ({
      id: e.id || e.name,
      name: e.name || e.id,
      entityType: e.entityType || e.kind || 'generic',
      tags: Array.isArray(e.tags) ? e.tags : undefined,
      observations: Array.isArray(e.observations) && e.observations.length ? e.observations : ['sanitized'],
      summary: e.summary,
      description: e.description,
      content: e.content
    }));

    if (preferRpc) {
      const client = createMcpClient({ endpoint, apiKey, clientInfo: { name: 'memory-sanitize-expo', version: '1.0.0' } });
      await client.initialize();
      await client.toolsCall('delete_entities', { entityNames: ids });
      await client.toolsCall('create_entities', { entities: payload });
    } else {
      await deleteEntitiesLegacy(endpoint, namespace, apiKey, ids);
      await createEntitiesLegacy(endpoint, namespace, apiKey, payload);
    }
  } else {
    console.error('[sanitize] Mode inconnu:', args.mode);
    process.exit(2);
  }

  console.log('[sanitize] Terminé.');
}

main().catch(err => {
  console.error('[sanitize][error]', err.message);
  process.exit(1);
});
