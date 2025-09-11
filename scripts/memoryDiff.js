#!/usr/bin/env node
/**
 * memoryDiff.js
 * Compare le snapshot local (memory-index.json + memory-entities-input.json) avec le graphe serveur (memory-graphs.json)
 * et produit un rapport: memory-diff.json
 *
 * Features (A + B):
 *  - Détection entités manquantes (local -> serveur / serveur -> local)
 *  - Détection hash divergents (si champ hash présent côté local)
 *  - Score de ranking simple = (relationsIn + relationsOut) + typeWeight + obsWeight
 *  - Génère topN (par défaut 20) entités prioritaires à surveiller
 *
 * Env:
 *  DIFF_TOPN=30   (optionnel)
 *
 * Entrées requises: exécuter avant:
 *  - npm run memory:index (produit memory-index.json)
 *  - npm run memory:entities (produit memory-entities-input.json)
 *  - npm run memory:read (produit memory-graphs.json)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname,'..');
const indexFile = path.join(ROOT,'memory-index.json');
const entitiesInputFile = path.join(ROOT,'memory-entities-input.json');
const graphFile = path.join(ROOT,'memory-graphs.json');
const outFile = path.join(ROOT,'memory-diff.json');

// Racines potentielles pour retrouver le chemin réel des entités
const FRONT_ROOT = path.join(ROOT,'..');

function resolveLocalPath(entity){
  if (!entity) return null;
  const id = entity.name || entity.id;
  if (!id) return null;
  // Heuristiques basées sur patterns déjà utilisés dans generation d'entités
  if (id.startsWith('ws:')) {
    const base = id.replace(/^ws:/,'');
    const p = path.join(ROOT,'ws', base + '.js');
    return fs.existsSync(p)?p:null;
  }
  if (id.startsWith('utils/')) {
    const p = path.join(ROOT, id + '.js');
    return fs.existsSync(p)?p:null;
  }
  if (id.startsWith('Expo/')) {
    // retirer éventuelle extension déjà incluse
    const clean = id.replace(/\.jsx$|\.js$/,'');
    const jsx = path.join(FRONT_ROOT, clean + '.jsx');
    const js = path.join(FRONT_ROOT, clean + '.js');
    if (fs.existsSync(jsx)) return jsx;
    if (fs.existsSync(js)) return js;
    return null;
  }
  if (id === 'data:collections') {
    const p = path.join(ROOT,'utils','ensureUserDbStructure.js');
    return fs.existsSync(p)?p:null;
  }
  if (id === 'conv:conventions') {
    const p = path.join(ROOT,'.github','copilot-instructions.md');
    return fs.existsSync(p)?p:null;
  }
  if (id.startsWith('batch:')) {
    const p = path.join(ROOT,'dailyPriceAverager.js');
    return fs.existsSync(p)?p:null;
  }
  // scripts, routes: id peut ressembler à scripts/buildMemoryIndex
  if (id.startsWith('scripts/')) {
    const p = path.join(ROOT, id + '.js');
    const p2 = path.join(ROOT, id + '.cjs');
    return fs.existsSync(p)?p:(fs.existsSync(p2)?p2:null);
  }
  if (id.startsWith('routes/')) {
    const p = path.join(ROOT, id + '.js');
    return fs.existsSync(p)?p:null;
  }
  return null;
}

function fileStalenessDays(p){
  try {
    const stat = fs.statSync(p);
    const ageMs = Date.now() - stat.mtimeMs;
    return ageMs / (1000*60*60*24);
  } catch { return null; }
}

function readJSON(file){ try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return null; } }

const idx = readJSON(indexFile);
const entsInput = readJSON(entitiesInputFile);
const graph = readJSON(graphFile);

if(!idx || !entsInput || !graph){
  console.error('Fichiers requis manquants (memory-index.json, memory-entities-input.json, memory-graphs.json)');
  process.exit(1);
}

const localEntries = idx.entries || [];
const localExtraEntities = (entsInput.entities)||[];
// Fusion locale (priorité à entries pour hash si duplication id)
const localMap = new Map();
[...localExtraEntities, ...localEntries].forEach(e => {
  const id = e.id || e.name; if(!id) return; if(!localMap.has(id)) localMap.set(id, e); else if (e.hash) localMap.set(id, e);
});

const serverEntities = (graph.entities)||graph; // support format direct
const serverRelations = graph.relations || [];
const serverMap = new Map();
serverEntities.forEach(e => serverMap.set(e.name || e.id, e));

const missingOnServer = [];
const hashDiff = [];
localMap.forEach((val,id) => {
  if(!serverMap.has(id)) missingOnServer.push(id); else {
    const srv = serverMap.get(id);
    if (val.hash && srv.hash && val.hash !== srv.hash) hashDiff.push({ id, localHash: val.hash, serverHash: srv.hash });
  }
});

const extraOnServer = [];
serverMap.forEach((val,id)=> { if(!localMap.has(id)) extraOnServer.push(id); });

// Relations index + degree calculation
const relIn = new Map();
const relOut = new Map();
serverRelations.forEach(r => {
  relOut.set(r.from, (relOut.get(r.from)||0)+1);
  relIn.set(r.to, (relIn.get(r.to)||0)+1);
});

// Approx centrality: degree / maxDegree (normalized)
let maxDegree = 1;
serverEntities.forEach(e => {
  const id = e.name || e.id;
  const d = (relIn.get(id)||0)+(relOut.get(id)||0);
  if (d > maxDegree) maxDegree = d;
});

function typeWeight(t){
  switch(t){
    case 'ws-handler': return 5;
    case 'util-backend': return 3;
    case 'batch-task': return 4;
    case 'data-model': return 6;
    case 'frontend-component': return 2;
    case 'frontend-hook': return 2;
    case 'frontend-util': return 1;
    case 'conventions': return 7;
    default: return 1;
  }
}

const ranked = [];
serverEntities.forEach(e => {
  const id = e.name || e.id;
  const inC = relIn.get(id)||0;
  const outC = relOut.get(id)||0;
  const deg = inC + outC;
  const centrality = deg / maxDegree;
  const obsC = (e.observations||[]).length;
  const localPath = resolveLocalPath(e);
  const staleDays = localPath ? fileStalenessDays(localPath) : null;
  // pénalité staleness progressive après 7 jours sans modification
  let stalePenalty = 0;
  if (staleDays != null && staleDays > 7) {
    stalePenalty = Math.min((staleDays - 7) * 0.05, 5); // borne à 5
  }
  // orphan penalty
  const orphanPenalty = deg === 0 ? 5 : 0; // fort pour surfaced orphans
  // observation richness bonus (diminishing)
  const obsBonus = Math.min(obsC,5)*0.4;
  // type weight
  const tWeight = typeWeight(e.entityType);
  // final score
  const score = (deg * 1.2) + (centrality * 3) + tWeight + obsBonus - orphanPenalty - stalePenalty;
  ranked.push({ id, entityType: e.entityType, in: inC, out: outC, obs: obsC, degree: deg, centrality: Number(centrality.toFixed(3)), orphan: deg===0, staleDays: staleDays!=null?Number(staleDays.toFixed(1)):null, score: Number(score.toFixed(3)) });
});
ranked.sort((a,b)=> b.score - a.score);

const topN = Number(process.env.DIFF_TOPN || 20);
const top = ranked.slice(0, topN);

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    local: localMap.size,
    server: serverMap.size,
    relations: serverRelations.length,
    missingOnServer: missingOnServer.length,
    extraOnServer: extraOnServer.length,
    hashDiff: hashDiff.length
  },
  missingOnServer,
  extraOnServer,
  hashDiff,
  rankedTop: top,
  rankingModel: {
    formula: 'score = deg*1.2 + centrality*3 + typeWeight + obsBonus - orphanPenalty - stalePenalty',
    notes: 'centrality=degree/maxDegree; orphanPenalty=5 si degree=0; obsBonus=min(obs,5)*0.4; stalePenalty=max(0,(staleDays-7)*0.05) ≤5'
  }
};

fs.writeFileSync(outFile, JSON.stringify(report,null,2));
console.log(`[memory:diff] écrit ${outFile} (missing=${missingOnServer.length}, extra=${extraOnServer.length}, hashDiff=${hashDiff.length})`);
