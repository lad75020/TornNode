#!/usr/bin/env node
/**
 * memoryPurge.js
 * Supprime des entités sur le serveur MCP Memory via endpoint delete_entities.
 * Lit memory-diff.json et supprime les "extra" sauf si filtrées.
 * Env requis: MEMORY_MCP_ENDPOINT
 * Optionnels: MEMORY_MCP_NAMESPACE, MEMORY_MCP_API_KEY
 * Flags:
 *   --dry (ne fait qu'afficher)
 *   --keep <fragment1,fragment2> (ignore les entités contenant ces fragments)
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const endpoint = process.env.MEMORY_MCP_ENDPOINT;
  if (!endpoint) { console.error('MEMORY_MCP_ENDPOINT manquant'); process.exit(1); }
  const base = endpoint.replace(/\/$/, '');
  const namespace = process.env.MEMORY_MCP_NAMESPACE;
  const apiKey = process.env.MEMORY_MCP_API_KEY;
  const diffPath = path.join(process.cwd(), 'memory-diff.json');
  if (!fs.existsSync(diffPath)) { console.error('memory-diff.json absent. Exécutez npm run memory:diff'); process.exit(2); }
  const diff = JSON.parse(fs.readFileSync(diffPath,'utf8'));
  const extra = diff.extraOnServer || diff.extra || [];
  if (!extra.length) { console.log('Aucune entité extra à purger.'); return; }

  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const keepIdx = args.indexOf('--keep');
  let keepFragments = [];
  if (keepIdx !== -1 && args[keepIdx+1]) keepFragments = args[keepIdx+1].split(',').map(s => s.trim()).filter(Boolean);

  const toDelete = extra.filter(id => !keepFragments.some(f => id.includes(f)));
  if (!toDelete.length) { console.log('Rien à supprimer après filtrage.'); return; }

  console.log(`[purge] Candidates (${toDelete.length})`);
  toDelete.forEach(id => console.log('  delete:', id));
  if (dry) { console.log('[purge] Mode dry, arrêt.'); return; }

  const payload = { entityNames: toDelete, ...(namespace ? { namespace } : {}) };
  const url = base + '/delete_entities';
  try {
    const res = await fetch(url, { method:'POST', headers: { 'Content-Type':'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` }: {}) }, body: JSON.stringify(payload) });
    const txt = await res.text();
    console.log('[purge] status=' + res.status + ' body=' + txt.slice(0,300));
    if (!res.ok) process.exit(3);
  } catch(e) {
    console.error('[purge] erreur requête: ' + e.message); process.exit(4);
  }
}

main();
