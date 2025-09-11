#!/usr/bin/env node
/*
 * generateAllEntitiesInput.js
 * Construit un fichier JSON d'entrée pour ingestion mémoire contenant toutes les entités détectées
 * (handlers WS, routes, utils backend, scripts, tâches batch, composants frontend, hooks, utils front, config).
 *
 * Sortie: memory-entities-input.json
 * Format: { namespace, generatedAt, entities: [ { id, name, entityType, tags, summary, observations, file, hash } ] }
 *
 * Env:
 *  MEMORY_MCP_NAMESPACE (optionnel, défaut: tornnode)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const FRONT_ROOT = path.join(ROOT, '..', 'Expo');
const NS = process.env.MEMORY_MCP_NAMESPACE || 'tornnode';
const OUTPUT = path.join(ROOT, 'memory-entities-input.json');

function sha1(c){return crypto.createHash('sha1').update(c).digest('hex');}
function read(file){try{return fs.readFileSync(file,'utf8');}catch{return ''}}
function list(dir){try{return fs.readdirSync(dir);}catch{return []}}

function firstMeaningfulLine(code){
  const lines = code.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return '';
  // Chercher un commentaire en tête
  const l = lines[0].replace(/^\/\//,'').replace(/^\/\*+|\*+\/$/g,'').trim();
  return l.slice(0,200);
}

function summarizeWs(code, fname){
  const types = [...code.matchAll(/type\s*:\s*['"]([a-zA-Z0-9_:-]+)['"]/g)].map(m=>m[1]);
  let summary;
  if (fname === 'wsTorn.js') summary = 'Import logs segmenté 15min + progression + différé attaques';
  else if (fname === 'wsUpdatePrice.js') summary = 'MAJ prix Items Mongo + Redis + variation journalière';
  else summary = (types.length?`Émet types ${[...new Set(types)].slice(0,5).join(', ')}`:'Handler WS');
  return summary;
}

function classify(relative){
  if(relative.startsWith('ws/')) return 'ws-handler';
  if(relative.startsWith('routes/')) return 'route';
  if(relative.startsWith('utils/')) return 'util-backend';
  if(relative.startsWith('scripts/')) return 'script';
  if(relative.endsWith('dailyPriceAverager.js')) return 'batch-task';
  if(relative.startsWith('Expo/src/hooks/')) return 'frontend-hook';
  if(relative.startsWith('Expo/src/')) {
    if(/\.jsx$/.test(relative)) return 'frontend-component';
    return 'frontend-util';
  }
  if(relative === 'Expo/vite.config.js') return 'frontend-config';
  return 'source';
}

function tagsFor(kind){
  switch(kind){
    case 'ws-handler': return ['ws','backend'];
    case 'route': return ['http-route','backend'];
    case 'util-backend': return ['util','backend'];
    case 'script': return ['script','tooling'];
    case 'batch-task': return ['batch','backend'];
    case 'frontend-component': return ['component','frontend'];
    case 'frontend-hook': return ['hook','frontend'];
    case 'frontend-util': return ['util','frontend'];
    case 'frontend-config': return ['config','build'];
    default: return ['source'];
  }
}

function collectBackend(){
  const acc = [];
  // WS handlers
  list(path.join(ROOT,'ws')).filter(f=>f.startsWith('ws')&&f.endsWith('.js')).forEach(f=>{
    const rel = 'ws/'+f;
    const code = read(path.join(ROOT, rel));
    acc.push(makeEntity(rel, code));
  });
  // Routes
  list(path.join(ROOT,'routes')).filter(f=>f.endsWith('.js')).forEach(f=>{
    const rel = 'routes/'+f; const code = read(path.join(ROOT, rel)); acc.push(makeEntity(rel, code));
  });
  // Utils
  list(path.join(ROOT,'utils')).filter(f=>f.endsWith('.js')||f.endsWith('.cjs')).forEach(f=>{
    const rel = 'utils/'+f; const code = read(path.join(ROOT, rel)); acc.push(makeEntity(rel, code));
  });
  // Scripts directory
  list(path.join(ROOT,'scripts')).filter(f=>f.endsWith('.js')||f.endsWith('.cjs')).forEach(f=>{
    if (f === path.basename(__filename)) return; // skip self
    const rel = 'scripts/'+f; const code = read(path.join(ROOT, rel)); acc.push(makeEntity(rel, code));
  });
  // Root notable files
  ['dailyPriceAverager.js','tonstatsdubbo.js','fetchLogsAndFillMongo.cjs'].forEach(f=>{
    const abs = path.join(ROOT,f); if (fs.existsSync(abs)) { acc.push(makeEntity(f, read(abs))); }
  });
  return acc;
}

function walkDir(dir, collector){
  let entries=[]; try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const ent of entries){
    const full = path.join(dir, ent.name);
    if(ent.isDirectory()) walkDir(full, collector);
    else if(/\.(jsx?|cjs)$/.test(ent.name)) collector(full);
  }
}

function collectFrontend(){
  const acc=[];
  const src = path.join(FRONT_ROOT,'src');
  walkDir(src, full=>{
    const rel = path.relative(path.join(ROOT,'..'), full).replace(/\\/g,'/'); // e.g., Expo/src/Component.jsx
    const code = read(full);
    acc.push(makeEntity(rel, code));
  });
  // Vite config
  const vite = path.join(FRONT_ROOT,'vite.config.js');
  if(fs.existsSync(vite)) acc.push(makeEntity('Expo/vite.config.js', read(vite)));
  return acc;
}

function makeEntity(rel, code){
  const kind = classify(rel);
  let summary;
  if (kind === 'ws-handler') summary = summarizeWs(code, path.basename(rel));
  else if (kind === 'batch-task') summary = 'Tâche batch quotidienne';
  else if (kind === 'frontend-config') summary = 'Config build Vite';
  else {
    const first = firstMeaningfulLine(code);
    summary = first || `Source ${rel}`;
  }
  summary = summary.slice(0,180);
  const id = rel.replace(/\.jsx?$/,'').replace(/\.cjs$/,'');
  let lastTouched=null; 
  try { 
    let abs;
    if (rel.startsWith('Expo/')) abs = path.join(ROOT, '..', rel.replace(/^Expo\//,''));
    else abs = path.join(ROOT, rel);
    const st=fs.statSync(abs); lastTouched=st.mtime.toISOString();
  } catch {}
  return {
    id,
    name: id,
    entityType: kind,
    tags: tagsFor(kind),
    summary,
    observations: [summary],
    file: rel,
    hash: sha1(code||''),
    lastTouched
  };
}

function main(){
  const backend = collectBackend();
  const frontend = collectFrontend();
  const all = [...backend, ...frontend];
  // dédup (en cas de collision improbable)
  const map = new Map();
  all.forEach(e=>{ map.set(e.id, e); });
  const entities = [...map.values()].sort((a,b)=> a.id.localeCompare(b.id));
  const out = { namespace: NS, generatedAt: new Date().toISOString(), count: entities.length, entities };
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`[memory:entities] écrit ${OUTPUT} (${entities.length} entités)`);
}

main();
