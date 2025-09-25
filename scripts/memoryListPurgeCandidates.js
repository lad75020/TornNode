#!/usr/bin/env node
/**
 * memoryListPurgeCandidates.js
 * Liste les entités présentes côté serveur mais absentes de l'index courant ("extra")
 * et celles manquantes côté serveur ("missing"), à partir de memory-diff.json.
 * Usage: node scripts/memoryListPurgeCandidates.js
 */
const fs = require('fs');
const path = require('path');

function main() {
  const diffPath = path.join(process.cwd(), 'memory-diff.json');
  if (!fs.existsSync(diffPath)) {
    console.error('memory-diff.json introuvable. Exécutez d\'abord: npm run memory:diff');
    process.exit(1);
  }
  const diff = JSON.parse(fs.readFileSync(diffPath,'utf8'));
  const extra = diff.extraOnServer || diff.extra || [];
  const missing = diff.missingOnServer || diff.missing || [];
  console.log('--- MEMORY PURGE CANDIDATES ---');
  console.log('Extra (présentes sur serveur, absentes index):', extra.length);
  extra.slice(0,200).forEach(id => console.log('  extra:', id));
  if (extra.length > 200) console.log(`  ... (${extra.length-200} de plus)`);
  console.log('Missing (attendues index, absentes serveur):', missing.length);
  missing.slice(0,200).forEach(id => console.log('  missing:', id));
  console.log('\nNOTE: Aucun endpoint de suppression implémenté dans les scripts.');
  console.log('      Pour purger réellement, ajouter un script qui POST/DELETE vers /delete_entities (si disponible).');
}

main();
