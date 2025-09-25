#!/usr/bin/env node
/**
 * memoryPurgeRelations.js
 * Supprime des relations orphelines du serveur MCP Memory via endpoint delete_relations.
 * Stratégie:
 * 1. Lit memory-graphs.json (doit contenir entities & relations) sinon échoue.
 * 2. Construit set des entités attendues à partir de memory-index.json (notre source de vérité locale).
 * 3. Marque comme orphelines les relations dont from ou to n'appartient pas au set local.
 * 4. POST /delete_relations avec tableau { from, to, relationType }.
 * Flags:
 *   --dry
 *   --limit N : ne supprime que N premières relations orphelines (après tri)
 *   --keepRelationType type1,type2 : conserve ces types
 * Env:
 *   MEMORY_MCP_ENDPOINT (obligatoire)
 *   MEMORY_MCP_NAMESPACE (optionnel)
 *   MEMORY_MCP_API_KEY (optionnel)
 */
const fs = require('fs');
const path = require('path');

function loadJson(p){ if(!fs.existsSync(p)) { console.error('Fichier manquant: '+p); process.exit(2);} return JSON.parse(fs.readFileSync(p,'utf8')); }

async function main(){
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if(!endpoint){ console.error('MEMORY_MCP_ENDPOINT manquant'); process.exit(1);}  
  const base = endpoint.replace(/\/$/,'');
  const namespace = process.env.MEMORY_MCP_NAMESPACE;
  const apiKey = process.env.MEMORY_MCP_API_KEY;

  const graphsPath = path.join(process.cwd(),'memory-graphs.json');
  const indexPath = path.join(process.cwd(),'memory-index.json');
  const graphs = loadJson(graphsPath); // attendu: { entities:[], relations:[] }
  const index = loadJson(indexPath);   // attendu: { entities: [] } ou tableau

  // memory-index.json structure utilise 'entries' comme tableau principal
  const indexList = Array.isArray(index.entries) ? index.entries : (Array.isArray(index.entities) ? index.entities : (Array.isArray(index) ? index : []));
  const localEntities = new Set(indexList.map(e => e.id || e.name).filter(Boolean));
  const relations = graphs.relations || [];

  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx+1],10) : null;
  const keepTypeIdx = args.indexOf('--keepRelationType');
  let keepRelationTypes = [];
  if(keepTypeIdx !== -1 && args[keepTypeIdx+1]) keepRelationTypes = args[keepTypeIdx+1].split(',').map(s=>s.trim()).filter(Boolean);

  const orphan = relations.filter(r => {
    if(keepRelationTypes.includes(r.relationType)) return false; // conservées explicitement
    const f = r.from; const t = r.to;
    return !localEntities.has(f) || !localEntities.has(t);
  });

  if(!orphan.length){ console.log('Aucune relation orpheline détectée'); return; }
  console.log(`[relations-purge] Orphelines totales: ${orphan.length}`);

  const selected = limit ? orphan.slice(0,limit) : orphan;
  selected.forEach(r => console.log('  drop:', r.from, '--', r.relationType, '-->', r.to));

  if(dry){ console.log('[relations-purge] Mode dry, arrêt.'); return; }

  const payload = { relations: selected.map(r => ({ from: r.from, to: r.to, relationType: r.relationType })), ...(namespace ? { namespace } : {}) };
  const url = base + '/delete_relations';
  try {
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}`}: {}) }, body: JSON.stringify(payload) });
    const txt = await res.text();
    console.log('[relations-purge] status=' + res.status + ' body=' + txt.slice(0,300));
    if(!res.ok) process.exit(3);
  } catch(e){ console.error('[relations-purge] erreur requête: '+e.message); process.exit(4);}  
}

main();
