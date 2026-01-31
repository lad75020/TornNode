#!/usr/bin/env node
/**
 * memoryQuality.js
 * Calcule des métriques de qualité sur le graphe mémoire actuel + comparaison locale.
 * Produit memory-quality.json
 *
 * Métriques:
 *  - coverage.localIndexPct : % d'entrées d'index présentes sur le serveur
 *  - orphanRate : proportion entités sans relation (in+out=0)
 *  - relationDensity : relations / entité
 *  - avgObs : moyenne observations / entité
 *  - hashDrift : nombre d'entités avec hash local différent (si champs hash dans local & serveur)
 *  - topOrphans : liste des entités orphelines triées par type prioritaire (ws-handler, util-backend, data-model, frontend-component, playbook)
 *  - centralityApprox : score approximatif (degree) pour chaque entité (optionnel, résumé top N)
 *
 * Requiert fichiers pré-générés: memory-index.json, memory-entities-input.json, memory-graphs.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname,'..');
const indexFile = path.join(ROOT,'memory-index.json');
const entsInputFile = path.join(ROOT,'memory-entities-input.json');
const graphFile = path.join(ROOT,'memory-graphs.json');
const outFile = path.join(ROOT,'memory-quality.json');
const FRONT_ROOT = path.join(ROOT,'..');

function resolveLocalPath(id){
  if (id.startsWith('ws:')) {
    const p = path.join(ROOT,'ws', id.replace(/^ws:/,'') + '.js');
    return fs.existsSync(p)?p:null;
  }
  if (id.startsWith('utils/')) {
    const p = path.join(ROOT, id + '.js'); return fs.existsSync(p)?p:null;
  }
  // Ancienne structure front: Expo/ supprimée. On cherche désormais sous client/.
  if (id.startsWith('Expo/')) {
    // Signale un reliquat mémoire non migré.
    if (!global.__warnedExpoId) {
      console.warn('[memoryQuality] ID legacy Expo détecté dans graphe:', id);
      global.__warnedExpoId = true;
    }
    const migrated = id.replace(/^Expo\//,'client/');
    const clean = migrated.replace(/\.jsx$|\.js$/,'');
    const jsx = path.join(FRONT_ROOT, clean + '.jsx');
    const js = path.join(FRONT_ROOT, clean + '.js');
    return fs.existsSync(jsx)?jsx:(fs.existsSync(js)?js:null);
  }
  // Nouvelle racine front standard
  if (id.startsWith('client/')) {
    const clean = id.replace(/\.jsx$|\.js$/,'');
    const jsx = path.join(FRONT_ROOT, clean + '.jsx');
    const js = path.join(FRONT_ROOT, clean + '.js');
    return fs.existsSync(jsx)?jsx:(fs.existsSync(js)?js:null);
  }
  if (id === 'data:collections') {
    const p = path.join(ROOT,'utils','ensureUserDbStructure.js'); return fs.existsSync(p)?p:null;
  }
  if (id === 'conv:conventions') {
    const p = path.join(ROOT,'.github','copilot-instructions.md'); return fs.existsSync(p)?p:null;
  }
  if (id.startsWith('scripts/')) {
    const p = path.join(ROOT, id + '.js'); const p2 = path.join(ROOT,id + '.cjs');
    return fs.existsSync(p)?p:(fs.existsSync(p2)?p2:null);
  }
  if (id.startsWith('routes/')) {
    const p = path.join(ROOT,id + '.js'); return fs.existsSync(p)?p:null;
  }
  return null;
}

function fileStalenessDays(p){
  try { const stat = fs.statSync(p); return (Date.now()-stat.mtimeMs)/(1000*60*60*24); } catch { return null; }
}

function readJSON(f){ try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return null; } }

const idx = readJSON(indexFile);
const entsInput = readJSON(entsInputFile);
const graph = readJSON(graphFile);

if (!idx || !entsInput || !graph) {
  console.error('Fichiers requis manquants (générer index, entities, graph avant).');
  process.exit(1);
}

const indexEntries = idx.entries || [];
const localExtra = entsInput.entities || [];
const localMap = new Map();
[...indexEntries, ...localExtra].forEach(e => { const id = e.id || e.name; if(id) localMap.set(id, e); });

const serverEntities = graph.entities || graph; // fallback
const serverRelations = graph.relations || [];
const serverMap = new Map();
serverEntities.forEach(e => serverMap.set(e.name || e.id, e));

// Coverage: combien de entries de l'index sont sur serveur
let covered = 0;
indexEntries.forEach(e => { if (serverMap.has(e.id)) covered++; });
const coveragePct = indexEntries.length ? (covered / indexEntries.length)*100 : 100;

// Hash drift
const hashDrift = [];
indexEntries.forEach(e => {
  const srv = serverMap.get(e.id);
  if (srv && e.hash && srv.hash && e.hash !== srv.hash) hashDrift.push({ id: e.id, localHash: e.hash, serverHash: srv.hash });
});

// Degree / orphan
const degIn = new Map();
const degOut = new Map();
serverRelations.forEach(r => {
  degOut.set(r.from,(degOut.get(r.from)||0)+1);
  degIn.set(r.to,(degIn.get(r.to)||0)+1);
});
const orphans = [];
serverEntities.forEach(e => {
  const id = e.name || e.id;
  const dIn = degIn.get(id)||0;
  const dOut = degOut.get(id)||0;
  if (dIn + dOut === 0) orphans.push({ id, entityType: e.entityType });
});
const orphanRate = serverEntities.length ? orphans.length / serverEntities.length : 0;
const relationDensity = serverEntities.length ? serverRelations.length / serverEntities.length : 0;

// Observations stats
let totalObs = 0; let obsCount = 0;
serverEntities.forEach(e => { if (Array.isArray(e.observations)) { totalObs += e.observations.length; obsCount++; } });
const avgObs = obsCount ? totalObs / obsCount : 0;

// Centrality approximative = degree total
const centrality = serverEntities.map(e => {
  const id = e.name || e.id;
  const score = (degIn.get(id)||0) + (degOut.get(id)||0);
  return { id, entityType: e.entityType, degree: score };
}).sort((a,b)=> b.degree - a.degree);
const topCentral = centrality.slice(0,15);

// Staleness distribution
const staleEntries = [];
serverEntities.forEach(e => {
  const id = e.name || e.id;
  const p = resolveLocalPath(id);
  if (!p) return;
  const d = fileStalenessDays(p);
  if (d != null) staleEntries.push({ id, entityType: e.entityType, staleDays: Number(d.toFixed(1)) });
});
staleEntries.sort((a,b)=> b.staleDays - a.staleDays);
const topStale = staleEntries.slice(0,15);
const avgStale = staleEntries.length ? staleEntries.reduce((a,b)=>a+b.staleDays,0)/staleEntries.length : 0;
const medianStale = (()=>{ if(!staleEntries.length) return 0; const arr=[...staleEntries].map(e=>e.staleDays).sort((a,b)=>a-b); const mid=Math.floor(arr.length/2); return arr.length%2?arr[mid]:(arr[mid-1]+arr[mid])/2; })();

// Trier orphans par priorité (types critiques d'abord)
const typePriority = {
  'data-model': 1,
  'ws-handler': 2,
  'util-backend': 3,
  'batch-task': 4,
  'frontend-component': 5,
  'playbook': 6,
  'frontend-util': 7,
  'frontend-hook': 8
};
orphans.sort((a,b)=> (typePriority[a.entityType]||99) - (typePriority[b.entityType]||99));
const topOrphans = orphans.slice(0,20);

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    serverEntities: serverEntities.length,
    serverRelations: serverRelations.length,
    indexEntries: indexEntries.length,
    localAll: localMap.size
  },
  coverage: { covered, total: indexEntries.length, coveragePct: Number(coveragePct.toFixed(2)) },
  orphanRate: Number(orphanRate.toFixed(4)),
  relationDensity: Number(relationDensity.toFixed(4)),
  avgObs: Number(avgObs.toFixed(2)),
  hashDriftCount: hashDrift.length,
  hashDrift,
  topCentral,
  staleness: {
    count: staleEntries.length,
    avgDays: Number(avgStale.toFixed(2)),
    medianDays: Number(medianStale.toFixed(2)),
    topStale
  },
  topOrphans,
  suggestions: []
};

// Suggestions basées sur seuils
if (coveragePct < 90) report.suggestions.push('Augmenter couverture: relancer memory:index puis pousser entités manquantes.');
if (orphanRate > 0.25) report.suggestions.push('Beaucoup d\'entités orphelines: générer relations (memory:relations) ou enrichir scripts heuristiques.');
if (relationDensity < 1) report.suggestions.push('Densité faible: vérifier détection relations (imports / uses).');
if (hashDrift.length > 0) report.suggestions.push('Mettre à jour entités dérivées: repush changed-only (MEMORY_MCP_CHANGED_ONLY=1).');
if (report.staleness && report.staleness.avgDays > 14) report.suggestions.push('Beaucoup de fichiers anciens: prioriser refactor / documentation sur topStale.');
if (topStale[0] && topStale[0].staleDays > 30) report.suggestions.push('Fichiers très anciens détectés (>30j): envisager audit technique.');

fs.writeFileSync(outFile, JSON.stringify(report,null,2));
console.log(`[memory:quality] écrit ${outFile}`);
