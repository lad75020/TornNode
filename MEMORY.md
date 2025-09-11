# Mémoire Architecture (MCP)

Scripts fournis pour générer et pousser un index mémoire décrivant l’architecture et les patterns TornNode.

## Fichiers clés
- `scripts/buildMemoryIndex.js` : scanne handlers WS, conventions, utils.
- `scripts/installMemoryGitHook.js` : installe hook `pre-commit` régénérant l’index si changements pertinents.
- `memory-index.json` : sortie générée (commitée si modifiée).
- `memory-sample-entries.json` : exemples de structure d’entrées.

## Utilisation
Générer manuellement:
```
npm run memory:index
```
Installer hook Git (une fois):
```
npm run memory:install-hook
```

## Push vers serveur MCP Memory
Définir variables d’environnement avant d’exécuter le script:
```
export MEMORY_MCP_ENDPOINT="https://memory.example/api"
export MEMORY_MCP_NAMESPACE="tornnode"
export MEMORY_MCP_API_KEY="<token>"   # si nécessaire
npm run memory:index
```
Mettre `DRY_RUN=true` pour empêcher tout envoi (par défaut si `MEMORY_MCP_ENDPOINT` absent):
```
DRY_RUN=true npm run memory:index
```

Le script publie chaque entrée via POST `${MEMORY_MCP_ENDPOINT}/memory/create` avec payload:
```json
{ "namespace": "tornnode", "id": "ws:wsTorn", "tags": ["ws:commands"], "text": "{...json entry...}" }
```

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
