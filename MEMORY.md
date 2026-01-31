# Mémoire Architecture (MCP)

Scripts fournis pour générer et pousser un index mémoire décrivant l’architecture et les patterns TornNode.

## Fichiers clés
- `scripts/buildMemoryIndex.js` : scanne handlers WS, conventions, utils.
- `scripts/installMemoryGitHook.js` : installe hook `pre-commit` régénérant l’index si changements pertinents.
- `memory-index.json` : sortie générée (commitée si modifiée).
- `memory-sample-entries.json` : exemples de structure d’entrées.

## Utilisation
`npm run memory:index` enchaîne maintenant:
1. `scripts/buildMemoryIndex.js` (avec `MEMORY_MCP_DISABLE_LEGACY_PUSH=1`) pour régénérer `memory-index.json` sans l'uploader HTTP historique.
2. `scripts/pushMemoryMcp.js` qui publie les entrées via JSON-RPC (`initialize` + `tools/call create_entities`).

Si aucune variable `MEMORY_MCP_ENDPOINT` n’est définie, l’étape 2 se contente de consigner "MEMORY_MCP_ENDPOINT non défini" et sort proprement, ce qui permet de lancer `npm run memory:index` hors connexion.

Installer le hook Git (une fois):
```
npm run memory:install-hook
```

## Push vers serveur MCP Memory
Définir les variables avant `npm run memory:index` pour déclencher l’envoi:
```
export MEMORY_MCP_ENDPOINT="https://memory.example/mcp"
export MEMORY_MCP_NAMESPACE="tornnode"
export MEMORY_MCP_API_KEY="<token>"   # optionnel
```
Ensuite :
```
npm run memory:index
```

Le nouveau script poste des paquets de 12 entités via `tools/call create_entities` (namespace propagé automatiquement) sur le gateway MCP (« streamable http »). Utiliser `DRY_RUN=true` si vous souhaitez uniquement rafraîchir `memory-index.json` sans appeler `pushMemoryMcp.js`.

## Contenu des entrées
Champs principaux:
- `id`: identifiant stable (ex: `ws:wsUpdatePrice`)
- `kind`: catégorie (`ws-handler`, `data-model`, `batch-task`, `conventions`…)
- `file`: chemin source relatif
- `hash`: hash SHA1 du contenu source pour détecter divergences
- `summary`: résumé concis actionnable
- `types` / `socketFlags`: spécifiques aux handlers WS
- `tags`: pour retrieval ciblé (ex: `ws:commands`, `perf:patterns`)

## Extension facile
Pour ajouter un nouveau pattern d’extraction:
1. Éditer `buildMemoryIndex.js` → créer une fonction qui retourne un objet d’entrée.
2. L’ajouter dans `buildIndex()`.
3. Régénérer l’index.

## Bonnes pratiques
- Garder les résumés < 40 mots.
- Mettre à jour `conv:conventions` si introduction d’un nouveau contrat (ex: nouveau flag socket standardisé).
- Ne pas inclure de secrets API / tokens (redacter si présent).

## Roadmap suggérée
- Ajout lint custom pour détecter réponses WS sans `type`.
- Ajout d’un champ `stability` (high|medium|volatile) pour prioriser revalidation.
- Script de comparaison (futur) alertant sur entrée hash mismatch non régénérée.

---
Pour questions ou extensions, mettre à jour ce fichier et régénérer l’index.

## Relations heuristiques
1. `npm run memory:read` (utilise désormais l'API MCP `read_graph` via JSON-RPC) pour rafraîchir `memory-graphs.json`.
2. `npm run memory:relations` génère `memory-relations.json` avec `MEMORY_MCP_DISABLE_LEGACY_PUSH=1`, puis appelle `scripts/pushMemoryRelationsMcp.js` qui publie les relations via `tools/call create_relations`.

Comme pour l'index, définissez `MEMORY_MCP_ENDPOINT` / `MEMORY_MCP_NAMESPACE` / `MEMORY_MCP_API_KEY` avant d'exécuter ces commandes et utilisez `DRY_RUN=true` si vous voulez éviter le push final.

## Autres utilitaires (purge, playbook, sanitize)
- `npm run memory:playbook` (scripts/addPlaybook.js): pousse une entité playbook via MCP JSON-RPC si `MEMORY_MCP_ENDPOINT` finit par `/mcp` (ou `MEMORY_MCP_USE_RPC=1`), sinon fallback REST `/create_entities`.
- `npm run memory:purge` (scripts/memoryPurge.js): supprime les entités `extraOnServer` via `delete_entities` (MCP) ou `/delete_entities` (REST).
- `npm run memory:purge:relations` (scripts/memoryPurgeRelations.js): supprime des relations via `delete_relations` (MCP) ou `/delete_relations` (REST).
- `npm run memory:sanitizeExpo` (scripts/memorySanitizeExpo.js): lit le graphe et supprime/nettoie les entités contenant "Expo" via MCP ou REST; supporte `DRY_RUN=true` / `--dry-run`.
