#!/usr/bin/env node
/**
 * memorySanitizeExpo.js
 *
 * Objectif: Purger ou nettoyer toutes les références résiduelles à l'ancien dossier Expo dans le serveur MCP Memory.
 *
 * Fonctionnalités:
 *  - Détection des entités dont l'id, le name ou une observation contient 'Expo' (case-insensitive).
 *  - Deux modes d'action:
 *      1. delete (par défaut): suppression pure des entités ciblées.
 *      2. scrub : réécriture des entités en retirant / remplaçant les occurrences 'Expo' par 'client'.
 *  - Dry-run (--dry-run ou MEMORY_SANITIZE_DRY_RUN=1) pour afficher ce qui serait fait.
 *  - Namespace configurable (MEMORY_MCP_NAMESPACE, défaut: tornnode).
 *  - Endpoint configurable (MEMORY_MCP_ENDPOINT, défaut: http://127.0.0.1:9111/memory).
 *  - Filtre additionnel optionnel via --include ou --exclude regex (appliqué après détection Expo).
 *
 * Usage:
 *   node scripts/memorySanitizeExpo.js --mode delete
 *   node scripts/memorySanitizeExpo.js --mode scrub
 *   MEMORY_SANITIZE_DRY_RUN=1 node scripts/memorySanitizeExpo.js --mode delete
 *
 * Ajoutez dans package.json:
 *   "memory:sanitizeExpo": "node scripts/memorySanitizeExpo.js --mode delete"
 */

const fetch = global.fetch || ((...args) => import('node-fetch').then(m => m.default(...args)));
const { argv, env } = process;

function parseArgs() {
  const args = { mode: 'delete', dryRun: false, include: null, exclude: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode' && argv[i+1]) { args.mode = argv[++i]; }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (a === '--include' && argv[i+1]) { args.include = new RegExp(argv[++i]); }
    else if (a === '--exclude' && argv[i+1]) { args.exclude = new RegExp(argv[++i]); }
    else if (a === '--help') { args.help = true; }
  }
  if (env.MEMORY_SANITIZE_DRY_RUN === '1') args.dryRun = true;
  return args;
}

async function readGraph(endpoint, namespace) {
  const res = await fetch(endpoint + '/read_graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace })
  });
  if (!res.ok) throw new Error('read_graph failed status=' + res.status);
  return res.json();
}

function detectExpoEntities(graph, includeRe, excludeRe) {
  const targets = [];
  const expoRe = /Expo/ig;
  for (const e of graph.entities || []) {
    const haystack = [e.id || e.name, e.name, ...(e.observations||[])].filter(Boolean).join('\n');
    if (expoRe.test(haystack)) {
      if (includeRe && !includeRe.test(haystack)) continue;
      if (excludeRe && excludeRe.test(haystack)) continue;
      targets.push(e);
    }
  }
  return targets;
}

async function deleteEntities(endpoint, namespace, ids) {
  const res = await fetch(endpoint + '/delete_entities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace, entityNames: ids })
  });
  if (!res.ok) throw new Error('delete_entities failed status=' + res.status);
  return res.text();
}

function scrubEntity(e) {
  const re = /Expo\/?/g; // remplace 'Expo' ou 'Expo/'
  const sanitized = { ...e };
  if (sanitized.name) sanitized.name = sanitized.name.replace(re, 'client/');
  if (sanitized.id) sanitized.id = sanitized.id.replace(re, 'client/');
  if (Array.isArray(sanitized.observations)) {
    sanitized.observations = sanitized.observations.map(o => o.replace(re, 'client/'));
  }
  return sanitized;
}

async function recreateEntities(endpoint, namespace, ents) {
  // Le serveur attend probablement un format simplifié: id/name/entityType/observations
  const payload = ents.map(e => ({
    id: e.id || e.name,
    name: e.name || e.id,
    entityType: e.entityType || e.kind || 'generic',
    observations: Array.isArray(e.observations) && e.observations.length ? e.observations : ['sanitized']
  }));
  const res = await fetch(endpoint + '/create_entities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace, entities: payload })
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
  const endpoint = (env.MEMORY_MCP_ENDPOINT || 'http://127.0.0.1:9111/memory').replace(/\/$/, '');
  const namespace = env.MEMORY_MCP_NAMESPACE || 'tornnode';

  console.log(`[sanitize] Endpoint=${endpoint} namespace=${namespace} mode=${args.mode} dryRun=${args.dryRun}`);
  const graph = await readGraph(endpoint, namespace);
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

  if (args.mode === 'delete') {
    const ids = targets.map(e => e.id || e.name);
    console.log('[sanitize] Suppression...');
    const res = await deleteEntities(endpoint, namespace, ids);
    console.log('[sanitize] delete_entities réponse:', res.slice(0,200));
  } else if (args.mode === 'scrub') {
    console.log('[sanitize] Mode scrub: suppression puis recréation entités nettoyées');
    const sanitized = targets.map(scrubEntity);
    const ids = targets.map(e => e.id || e.name);
    await deleteEntities(endpoint, namespace, ids);
    const res = await recreateEntities(endpoint, namespace, sanitized);
    console.log('[sanitize] recréation réponse:', res.slice(0,200));
  } else {
    console.error('[sanitize] Mode inconnu:', args.mode);
    process.exit(1);
  }
  console.log('[sanitize] Terminé.');
}

main().catch(err => { console.error('[sanitize][error]', err); process.exit(1); });
