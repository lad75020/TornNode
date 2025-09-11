#!/usr/bin/env node
/*
 * buildMemoryIndex.js
 * Génère un index mémoire JSON décrivant l'architecture TornNode pour un serveur MCP Memory.
 * - Scanne ws handlers, utils clés et config front.
 * - Extrait commandes WebSocket, types de réponses, collections Mongo implicites.
 * - Calcule un hash de contenu pour détection de dérive.
 * - Peut pousser vers un endpoint MCP (optionnel) si variables d'env définies.
 *
 * Env:
 *  MEMORY_MCP_ENDPOINT   (ex: https://memory.local/api)
 *  MEMORY_MCP_NAMESPACE  (ex: tornnode)
 *  MEMORY_MCP_API_KEY    (optionnel si auth requise)
 *  DRY_RUN=true          (n'envoie rien, juste fichier local)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const WS_DIR = path.join(ROOT, 'ws');
const UTILS_DIR = path.join(ROOT, 'utils');
const OUTPUT_FILE = path.join(ROOT, 'memory-index.json');

function sha1(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

function readSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function extractSocketSendTypes(code) {
  const types = new Set();
  // Capture JSON.stringify({ type:'xxx' ... }) or { type:"xxx" }
  const regex = /type\s*:\s*['"]([a-zA-Z0-9_:-]+)['"]/g;
  let m; while ((m = regex.exec(code))) { types.add(m[1]); }
  return [...types];
}

function extractProgressFlags(code) {
  const flags = [];
  const regex = /__([a-zA-Z0-9]+)\b/g;
  let m; while ((m = regex.exec(code))) { flags.push(m[1]); }
  return [...new Set(flags)];
}

function summarizeWsHandler(name, code) {
  const types = extractSocketSendTypes(code);
  const flags = extractProgressFlags(code).filter(f => /import|progress|deferred|stop/i.test(f));
  const longProcess = /setTimeout|setInterval|await new Promise|for \(let i=0;i<.+?100/.test(code) || /INTERVAL\s*=\s*900/.test(code);
  let summary;
  if (name === 'wsTorn.js') {
    summary = 'Import segmenté des logs (15min) avec progression percent, différé attaques.';
  } else if (name === 'wsUpdatePrice.js') {
    summary = 'Mise à jour prix item: Mongo Items + Redis JSON.SET + log daily variation TTL 3j.';
  } else {
    summary = (types.length ? `Émet types ${types.slice(0,5).join(', ')}` : 'Handler générique') + (longProcess ? ' (process long détecté)' : '');
  }
  return { types, flags, longProcess, summary };
}

function scanWsHandlers() {
  if (!fs.existsSync(WS_DIR)) return [];
  return fs.readdirSync(WS_DIR)
    .filter(f => f.startsWith('ws') && f.endsWith('.js'))
    .map(f => {
      const filePath = path.join(WS_DIR, f);
      const code = readSafe(filePath);
      let lastTouched=null; try { const st=fs.statSync(filePath); lastTouched=st.mtime.toISOString(); } catch {}
      const hash = sha1(code);
      const meta = summarizeWsHandler(f, code);
      return {
        id: `ws:${f.replace('.js','')}`,
        kind: 'ws-handler',
        file: `ws/${f}`,
        hash,
        lastTouched,
        types: meta.types,
        socketFlags: meta.flags,
        longProcess: meta.longProcess,
        summary: meta.summary,
        tags: ['ws:commands', ...(meta.longProcess ? ['perf:patterns'] : [])]
      };
    });
}

function extractCollectionsFromEnsure() {
  const ensureFile = path.join(UTILS_DIR, 'ensureUserDbStructure.js');
  const code = readSafe(ensureFile);
  let lastTouched=null; try { const st=fs.statSync(ensureFile); lastTouched=st.mtime.toISOString(); } catch {}
  const match = code.match(/const required = \[(.*?)\];/s);
  let collections = [];
  if (match) {
    collections = match[1].split(',').map(s => s.replace(/['"\s]/g,'')).filter(Boolean);
  }
  return {
    id: 'data:collections',
    kind: 'data-model',
    file: 'utils/ensureUserDbStructure.js',
    hash: sha1(code),
  lastTouched,
    collections,
    summary: `Collections multi-tenant: ${collections.join(', ')}`,
    tags: ['data:collections','arch:backend']
  };
}

function summarizeDailyAverager() {
  const file = path.join(ROOT, 'dailyPriceAverager.js');
  const code = readSafe(file);
  if (!code) return null;
  let lastTouched=null; try { const st=fs.statSync(file); lastTouched=st.mtime.toISOString(); } catch {}
  return {
    id: 'batch:dailyPriceAverage',
    kind: 'batch-task',
    file: 'dailyPriceAverager.js',
    hash: sha1(code),
    lastTouched,
    summary: 'Calcule moyennes journalières prix items à partir des variations en Redis (listes pricevars:YYYYMMDD:<itemId>).',
    tags: ['batch:tasks','cache:items']
  };
}

function summarizeFrontendBuild() {
  const vitePath = path.join(ROOT, '..', 'Expo', 'vite.config.js');
  const code = readSafe(vitePath);
  if (!code) return null;
  let lastTouched=null; try { const st=fs.statSync(vitePath); lastTouched=st.mtime.toISOString(); } catch {}
  const hasManualChunks = /manualChunks/.test(code);
  return {
    id: 'front:buildChunks',
    kind: 'frontend-build',
    file: 'Expo/vite.config.js',
    hash: sha1(code),
  lastTouched,
    summary: hasManualChunks ? 'Découpage manuel rollup vendors: react, chart, bootstrap.' : 'Pas de découpage manuel détecté.',
    tags: ['arch:frontend','perf:patterns']
  };
}

function coreConventionsEntry() {
  const instrPath = path.join(ROOT, '.github', 'copilot-instructions.md');
  const code = readSafe(instrPath);
  let lastTouched=null; try { const st=fs.statSync(instrPath); lastTouched=st.mtime.toISOString(); } catch {}
  return {
    id: 'conv:conventions',
    kind: 'conventions',
    file: '.github/copilot-instructions.md',
    hash: sha1(code),
    lastTouched,
    summary: 'Conventions: lazy require WS, CommonJS backend, progress % >=2% steps, TTL Redis, réponses {type, ok} miroir.',
    tags: ['conv:conventions']
  };
}

function buildIndex() {
  const entries = [];
  entries.push(...scanWsHandlers());
  entries.push(extractCollectionsFromEnsure());
  const daily = summarizeDailyAverager(); if (daily) entries.push(daily);
  const front = summarizeFrontendBuild(); if (front) entries.push(front);
  entries.push(coreConventionsEntry());
  return {
    generatedAt: new Date().toISOString(),
    version: 1,
    entriesCount: entries.length,
    entries
  };
}

async function pushToMcp(index) {
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  const namespace = process.env.MEMORY_MCP_NAMESPACE || 'tornnode';
  if (!endpoint || process.env.DRY_RUN === 'true') {
    console.log('[memory] DRY RUN or no endpoint, skip push');
    return;
  }
  const apiKey = process.env.MEMORY_MCP_API_KEY;
  const base = endpoint.replace(/\/$/, '');
  const pathEndpoint = process.env.MEMORY_MCP_PATH || '/create_entities';
  if (!process.env.MEMORY_MCP_SILENT) console.log('[memory][debug] endpoint=', pathEndpoint);

  const batchMode = process.env.MEMORY_MCP_BATCH === '1';
  const changedOnly = process.env.MEMORY_MCP_CHANGED_ONLY === '1';
  const cacheFile = path.join(ROOT, '.memory-push.json');
  let previous = {};
  if (changedOnly) {
    try { previous = JSON.parse(fs.readFileSync(cacheFile,'utf8')); } catch { previous = {}; }
  }

  // Filtrer les entrées si changed-only activé
  let entries = index.entries;
  if (changedOnly) {
    const beforeCount = entries.length;
    entries = entries.filter(e => previous[e.id] !== e.hash);
    const afterCount = entries.length;
    console.log(`[memory] changed-only mode: ${afterCount}/${beforeCount} modifiées`);
    if (afterCount === 0) {
      console.log('[memory] nothing changed, skipping push');
      return;
    }
  }

  async function tryPush(e) {
    // Construire un tableau d'observations basique (le serveur exige 'observations')
    // Hypothèse de schéma minimal: array d'objets avec au moins un champ 'value' ou 'text'.
    // On fournit plusieurs champs inoffensifs pour maximiser compatibilité.
    const observations = [ e.summary ];

    const entity = {
      id: e.id, // garder les ':'; fallback simplifié appliquera un slug
      name: e.id, // champ requis par le serveur (label humain)
      entityType: e.kind || 'generic',
      tags: e.tags,
      summary: e.summary,
      description: e.summary,
      kind: e.kind,
      file: e.file,
      hash: e.hash,
      lastTouched: e.lastTouched,
      text: `${e.summary} | types=${(e.types||[]).join(',')} | flags=${(e.socketFlags||[]).join(',')}`.trim(),
      content: e.summary,
      observations,
      data: e
    };
    if (process.env.MEMORY_MCP_DEBUG === '1') {
      try { console.log('[memory][debug] entity', JSON.stringify(entity).slice(0,600)); } catch {}
    }

    const url = base + pathEndpoint;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ namespace, entities: [entity] })
      });
      if (res.ok) {
        console.log(`[memory] pushed ${e.id}`);
        return true;
      }
      const bodyTxt = await res.text();
      console.warn(`[memory] push fail ${e.id} status=${res.status} body=${bodyTxt.slice(0,300)}`);
      return false;
    } catch (err) {
      console.warn(`[memory] push error ${e.id} err=${err.message}`);
      return false;
    }
  }

  if (batchMode) {
    const entities = entries.map(e => ({
      id: e.id,
      name: e.id,
      entityType: e.kind || 'generic',
      tags: e.tags,
      summary: e.summary,
      description: e.summary,
      kind: e.kind,
      file: e.file,
      hash: e.hash,
      lastTouched: e.lastTouched,
      text: `${e.summary} | types=${(e.types||[]).join(',')} | flags=${(e.socketFlags||[]).join(',')}`.trim(),
      content: e.summary,
      observations: [ e.summary ],
      data: e
    }));
    const url = base + pathEndpoint;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ namespace, entities })
      });
      if (res.ok) {
        console.log(`[memory] batch pushed ${entities.length} entities`);
        // mettre à jour cache
        if (changedOnly) {
          entries.forEach(e => { previous[e.id] = e.hash; });
          fs.writeFileSync(cacheFile, JSON.stringify(previous, null, 2));
        } else {
          const allMap = Object.fromEntries(index.entries.map(e => [e.id, e.hash]));
          fs.writeFileSync(cacheFile, JSON.stringify(allMap, null, 2));
        }
        return;
      }
      const bodyTxt = await res.text();
      console.warn(`[memory] batch push fail status=${res.status} body=${bodyTxt.slice(0,300)}`);
    } catch (err) {
      console.warn('[memory] batch push error', err.message);
    }
  } else {
    let okCount = 0;
    for (const e of entries) {
      const ok = await tryPush(e);
      if (ok) okCount++;
      if (changedOnly && ok) previous[e.id] = e.hash;
    }
    console.log(`[memory] push summary success=${okCount}/${entries.length}`);
    // Écrire le cache seulement si pas batch et changedOnly
    if (!batchMode) {
      const mapToSave = changedOnly ? previous : Object.fromEntries(index.entries.map(e => [e.id, e.hash]));
      fs.writeFileSync(cacheFile, JSON.stringify(mapToSave, null, 2));
    }
  }
}

async function main() {
  const index = buildIndex();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
  console.log(`[memory] index written ${OUTPUT_FILE} (${index.entriesCount} entrées)`);
  await pushToMcp(index);
}

main().catch(e => { console.error(e); process.exit(1); });
