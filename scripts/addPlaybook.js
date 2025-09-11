#!/usr/bin/env node
/**
 * addPlaybook.js
 * Crée une entité "playbook" (guide opérationnel) et la pousse sur le serveur mémoire.
 * Usage:
 *   node scripts/addPlaybook.js --title "Nouveau handler WS long" --tag ws --step "Créer fichier ws/wsMyFeature.js" --step "Ajouter routing dans routes/wsHandler.js" --step "Envoyer messages progress %" --step "Mettre à jour mémoire (memory:index)" --why "Standardiser ajout d'un import long" --id playbook:ws-long-handler
 *
 * Si --steps-file est fourni, lit un fichier texte (ligne = étape). Peut combiner avec --step.
 *
 * Champs générés:
 *  id/name: slug (ou --id)
 *  entityType: playbook
 *  observations: chaque étape + résumé + justification
 */
const fs = require('fs');
const path = require('path');

function parseArgs(){
  const args = process.argv.slice(2);
  const out = { steps: [] };
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if (a === '--title') out.title = args[++i];
    else if (a === '--step') out.steps.push(args[++i]);
    else if (a === '--steps-file') out.stepsFile = args[++i];
    else if (a === '--tag') { out.tags = out.tags || []; out.tags.push(args[++i]); }
    else if (a === '--why') out.why = args[++i];
    else if (a === '--id') out.id = args[++i];
    else if (a === '--dry') out.dry = true;
  }
  return out;
}

function slugify(str){
  return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

async function main(){
  const {
    title, stepsFile, why, id, dry
  } = (argv = parseArgs());
  let { steps } = argv;
  if (!title) { console.error('--title requis'); process.exit(1); }
  if (stepsFile) {
    try {
      const content = fs.readFileSync(stepsFile,'utf8');
      content.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach(l => steps.push(l));
    } catch (e) { console.warn('Impossible de lire steps-file', e.message); }
  }
  if (steps.length === 0) {
    console.error('Aucune étape (--step ou --steps-file)');
    process.exit(1);
  }
  const slug = id || `playbook:${slugify(title)}`;
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) {
    console.error('MEMORY_MCP_ENDPOINT non défini');
    process.exit(2);
  }
  const namespace = process.env.MEMORY_MCP_NAMESPACE || 'tornnode';
  const apiKey = process.env.MEMORY_MCP_API_KEY;
  const base = endpoint.replace(/\/$/,'');
  const pathEndpoint = process.env.MEMORY_MCP_PATH || '/create_entities';

  const summary = `Playbook: ${title}` + (why ? ` — ${why}` : '');
  const observations = [summary, ...steps.map((s,i)=>`Étape ${i+1}: ${s}`)];

  const entity = {
    id: slug,
    name: slug,
    entityType: 'playbook',
    tags: ['playbook','guide', ...(argv.tags||[])],
    summary,
    description: summary,
    observations,
    content: steps.join('\n'),
    steps,
    why
  };

  if (dry) {
    console.log('[playbook][dry-run]', JSON.stringify(entity,null,2));
    return;
  }

  try {
    const res = await fetch(base + pathEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey?{Authorization:`Bearer ${apiKey}`}:{}) },
      body: JSON.stringify({ namespace, entities: [entity] })
    });
    if (res.ok) {
      console.log(`[playbook] créé et poussé ${slug}`);
    } else {
      const t = await res.text();
      console.error('[playbook] échec', res.status, t.slice(0,400));
      process.exit(3);
    }
  } catch (e) {
    console.error('[playbook] erreur réseau', e.message);
    process.exit(4);
  }
}

main();
