#!/usr/bin/env node
/*
 * installMemoryGitHook.js
 * Installe un hook pre-commit qui régénère l'index mémoire si des fichiers clés changent.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
if (!fs.existsSync(gitDir)) {
  console.error('Pas de .git ici - exécuter à la racine du repo.');
  process.exit(1);
}
const hookDir = path.join(gitDir, 'hooks');
if (!fs.existsSync(hookDir)) fs.mkdirSync(hookDir, { recursive: true });
const hookFile = path.join(hookDir, 'pre-commit');

const SCRIPT = `#!/usr/bin/env bash
# Auto-generated hook: regenerate memory index when ws/ or utils/ or dailyPriceAverager changes.
changed=$(git diff --cached --name-only | grep -E '^(tornnode/ws/|tornnode/utils/|tornnode/dailyPriceAverager.js|tornnode/.github/copilot-instructions.md)' || true)
if [ -n "$changed" ]; then
  echo '[memory] Regenerating index (pre-commit)...'
  node tornnode/scripts/buildMemoryIndex.js >/dev/null 2>&1 || echo '[memory] generation failed'
  if [ -f tornnode/memory-index.json ]; then
    git add tornnode/memory-index.json
  fi
fi
`; 

fs.writeFileSync(hookFile, SCRIPT, { mode: 0o755 });
console.log('Hook pre-commit installé.');
