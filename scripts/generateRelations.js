#!/usr/bin/env node
/*
 * generateRelations.js
 * Construit un ensemble de relations heuristiques entre les entités déjà présentes
 * et les pousse (ou dry-run) vers l'endpoint /create_relations.
 *
 * Entrée principale: memory-graphs.json (obtenu via npm run memory:read)
 * Sortie: memory-relations.json (relations générées)
 *
 * Env:
 *  MEMORY_MCP_ENDPOINT   (obligatoire pour push)
 *  MEMORY_MCP_API_KEY    (optionnel)
 *  MEMORY_MCP_NAMESPACE  (optionnel) – pas indispensable si le serveur range par entité
 *  MEMORY_MCP_PATH_REL   (override chemin, défaut: /create_relations)
 *  DRY_RUN=1             (n'envoie pas, écrit juste le JSON)
 *
 * Heuristiques appliquées:
 *  - Person -> works_on -> Project (si entities Person & Project trouvées)
 *  - ws-handler -> uses -> util-backend (si nom util présent dans observation ou si pair (getUserDb, ensureUserDbStructure) logique)
 *  - ws-handler -> imports_type -> data-model (si data:collections présent)
 *  - frontend-component -> uses_hook -> frontend-hook (si le nom du hook figure dans le fichier .jsx correspondant)
 *  - frontend-component -> uses_util -> frontend-util (si import détecté)
 *  - batch-task -> affects -> data-model
 *  - frontend-config -> configures -> frontend-component (global relation unique)
 *  - util-backend -> depends_on -> data-model (si son code contient le nom d'une collection)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GRAPHS_FILE = path.join(ROOT, 'memory-graphs.json');
const OUTPUT = path.join(ROOT, 'memory-relations.json');

function loadGraphs(){
  if(!fs.existsSync(GRAPHS_FILE)) {
    console.error('Fichier memory-graphs.json introuvable. Lance d\'abord: npm run memory:read');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(GRAPHS_FILE,'utf8'));
  const entities = json.entities || json; // fallback si format direct
  return entities.filter(e => e.type === 'entity' || e.entityType);
}

function buildIndex(entities){
  const byName = new Map();
  entities.forEach(e => byName.set(e.name, e));
  return { byName };
}

function safeReadFile(rel){
  const maybeJsx = rel.match(/^(Expo\/src\/.+)(?:\.jsx|)$/);
  let localPath;
  if (rel.startsWith('Expo/src/')) {
    // Fichier frontend: ajouter extension connue si manquante
    const base = path.join(ROOT, '..', rel + (rel.endsWith('.js')||rel.endsWith('.jsx')?'':'.jsx'));
    localPath = base;
  } else if (rel.startsWith('ws/')) {
    localPath = path.join(ROOT, rel + '.js');
  } else if (/^utils\//.test(rel)) {
    localPath = path.join(ROOT, rel + '.js');
  } else {
    return '';
  }
  try { return fs.readFileSync(localPath,'utf8'); } catch { return ''; }
}

function detectHookUsage(componentCode, hooks){
  const used = [];
  hooks.forEach(h => {
    const base = h.name.split('/').pop();
    if (new RegExp(base + '\\b').test(componentCode)) used.push(h.name);
  });
  return [...new Set(used)];
}

function detectUtilUsage(componentCode, utils){
  const used = [];
  utils.forEach(u => {
    const base = u.name.split('/').pop();
    if (new RegExp(base + '\\b').test(componentCode)) used.push(u.name);
  });
  return [...new Set(used)];
}

function already(relations, from, type, to){
  return relations.some(r => r.from===from && r.relationType===type && r.to===to);
}

function generateRelations(entities) {
  const relations = [];
  const person = entities.filter(e => e.entityType === 'Person');
  const projects = entities.filter(e => e.entityType === 'Project');
  const wsHandlers = entities.filter(e => e.entityType === 'ws-handler');
  const utilsBackend = entities.filter(e => e.entityType === 'util-backend');
  const dataModel = entities.find(e => e.name === 'data:collections' || e.entityType === 'data-model');
  const batchTasks = entities.filter(e => e.entityType === 'batch-task');
  const frontComponents = entities.filter(e => e.entityType === 'frontend-component');
  const frontHooks = entities.filter(e => e.entityType === 'frontend-hook');
  const frontUtils = entities.filter(e => e.entityType === 'frontend-util');
  const frontConfig = entities.filter(e => e.entityType === 'frontend-config');
    const routes = entities.filter(e => e.entityType === 'route');
    const scripts = entities.filter(e => e.entityType === 'script');

  // Person works_on Project
  person.forEach(p => projects.forEach(pr => {
    if(!already(relations, p.name, 'works_on', pr.name)) relations.push({ type:'relation', from:p.name, relationType:'works_on', to:pr.name });
  }));

  // batch-task affects data-model
  if (dataModel) {
    batchTasks.forEach(b => {
      if(!already(relations, b.name, 'affects', dataModel.name)) relations.push({ type:'relation', from:b.name, relationType:'affects', to:dataModel.name });
    });
  }

  // ws-handler imports_type data-model
  if (dataModel) {
    wsHandlers.forEach(w => {
      if(!already(relations, w.name, 'imports_type', dataModel.name)) relations.push({ type:'relation', from:w.name, relationType:'imports_type', to:dataModel.name });
    });
  }

  // ws-handler uses util-backend (heuristique simple: pair with ensureUserDbStructure / itemsCacheKey if observation hints)
  wsHandlers.forEach(w => {
    const obsText = (w.observations||[]).join(' ').toLowerCase();
    utilsBackend.forEach(u => {
      const uname = u.name.toLowerCase();
      if (/db|cache|price|networth|log/.test(obsText) && (/ensureuserdbstructure|items|networth|fetchalllogs/.test(uname))) {
        if(!already(relations, w.name, 'uses', u.name)) relations.push({ type:'relation', from:w.name, relationType:'uses', to:u.name });
      }
    });
  });

  // util-backend depends_on data-model si code référence une collection connue
  const collectionNames = (dataModel && (dataModel.observations||[]).join(' ').match(/logs|attacks|Networth|Stats/ig)) || [];
  if (dataModel) {
    utilsBackend.forEach(u => {
      const code = safeReadFile(u.name);
      if (collectionNames.some(c => new RegExp(c, 'i').test(code))) {
        if(!already(relations, u.name, 'depends_on', dataModel.name)) relations.push({ type:'relation', from:u.name, relationType:'depends_on', to:dataModel.name });
      }
    });
  }

  // frontend-component uses_hook & uses_util
  frontComponents.forEach(cmp => {
    const code = safeReadFile(cmp.name);
    if (!code) return;
    const usedHooks = detectHookUsage(code, frontHooks);
    usedHooks.forEach(h => { if(!already(relations, cmp.name, 'uses_hook', h)) relations.push({ type:'relation', from:cmp.name, relationType:'uses_hook', to:h }); });
    const usedUtils = detectUtilUsage(code, frontUtils);
    usedUtils.forEach(u => { if(!already(relations, cmp.name, 'uses_util', u)) relations.push({ type:'relation', from:cmp.name, relationType:'uses_util', to:u }); });
  });

  // frontend-config configures frontend-component (relation large mais informative)
  frontConfig.forEach(cfg => frontComponents.forEach(cmp => {
    if(!already(relations, cfg.name, 'configures', cmp.name)) relations.push({ type:'relation', from:cfg.name, relationType:'configures', to:cmp.name });
  }));

  // routes -> handles -> ws-handler (en lisant routes/wsHandler ou autres routes/* pour patterns require('../ws/wsX') )
  routes.forEach(r => {
    const code = safeReadFile(r.name.replace(/:/g,'/')); // adapt id -> path approximation
    if (!code) return;
    wsHandlers.forEach(w => {
      const base = w.name.split(':').pop().replace(/ws:/,'');
      const simple = base.split('/').pop().replace(/^ws:/,'');
      if (new RegExp(simple.replace(/^ws:/,''),'i').test(code)) {
        if(!already(relations, r.name, 'handles', w.name)) relations.push({ type:'relation', from:r.name, relationType:'handles', to:w.name });
      }
    });
  });

  // scripts -> invokes -> ws-handler / util-backend (si code contient leur identifiant de fichier sans extension)
  scripts.forEach(s => {
    const code = safeReadFile(s.name.replace(/:/g,'/'));
    if (!code) return;
    wsHandlers.forEach(w => {
      const tag = w.name.split(':').pop();
      if (new RegExp(tag+'\\b').test(code)) {
        if(!already(relations, s.name, 'invokes', w.name)) relations.push({ type:'relation', from:s.name, relationType:'invokes', to:w.name });
      }
    });
    utilsBackend.forEach(u => {
      const tag = u.name.split('/').pop();
      if (new RegExp(tag+'\\b').test(code)) {
        if(!already(relations, s.name, 'uses', u.name)) relations.push({ type:'relation', from:s.name, relationType:'uses', to:u.name });
      }
    });
  });

  // ws-handler additional direct util usage by scanning code for util file basenames (covers orphans)
  wsHandlers.forEach(w => {
    const code = safeReadFile(w.name.replace(/^ws:/,'ws/'));
    if (!code) return;
    utilsBackend.forEach(u => {
      const base = u.name.split('/').pop();
      if (new RegExp(base+'\\b').test(code)) {
        if(!already(relations, w.name, 'uses', u.name)) relations.push({ type:'relation', from:w.name, relationType:'uses', to:u.name });
      }
    });
  });

  return relations;
}

async function pushRelations(relations){
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  const apiKey = process.env.MEMORY_MCP_API_KEY;
  const pathRel = process.env.MEMORY_MCP_PATH_REL || '/create_relations';
  if (!endpoint) {
    console.warn('Pas d\'endpoint défini, skip push');
    return false;
  }
  if (process.env.DRY_RUN === '1') {
    console.log('[memory:relations] DRY_RUN=1 (aucun push)');
    return true;
  }
  const url = endpoint.replace(/\/$/, '') + pathRel;
  const payload = { relations };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      console.log(`[memory:relations] pushed ${relations.length} relations`);
      return true;
    } else {
      const txt = await res.text();
      console.warn(`[memory:relations] push fail status=${res.status} body=${txt.slice(0,300)}`);
      return false;
    }
  } catch (e) {
    console.warn('[memory:relations] push error', e.message);
    return false;
  }
}

function main(){
  const entities = loadGraphs();
  const relations = generateRelations(entities);
  fs.writeFileSync(OUTPUT, JSON.stringify({ generatedAt:new Date().toISOString(), count: relations.length, relations }, null, 2));
  console.log(`[memory:relations] écrit ${OUTPUT} (${relations.length} relations)`);
  pushRelations(relations).then(()=>{});
}

main();
