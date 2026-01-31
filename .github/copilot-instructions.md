## TornNode – Guide succinct pour agents IA

Objectif: Faciliter contributions rapides et sûres sur une stack Fastify (backend temps-réel + Mongo/Redis) et front React/Vite orienté visualisation de données de Torn City. Concentrez-vous sur les patterns existants: WebSocket orienté commandes textuelles/JSON, multi‑tenant Mongo (1 DB par userID), cache Redis JSON pour items et agrégations de prix.

### Architecture haute‑niveau
Backend (`tornnode/`):
- Fastify v5 + `@fastify/websocket` expose `/ws` unique (voir `routes/wsHandler.js`). Les messages sont de simples strings (ex: `torn`, `tornAttacks`, `stats`) ou JSON `{ type: "updatePrice", ... }` routés dynamiquement via `require('../ws/...')` pour charger paresseusement les handlers (pas d'import statique global → garder ce style pour limiter le temps de démarrage et la mémoire).
- Multi‑tenant Mongo: chaque utilisateur authentifié (JWT déjà décodé en amont) obtient une base nommée par `userID`. `utils/ensureUserDbStructure.js` est appelé de façon idempotente au premier usage pour créer collections + indexes (`logs`, `attacks`, `Networth`, `Stats`). Ne créez pas manuellement ailleurs; appelez cette fonction si vous introduisez un nouveau flux dépendant de ces collections.
- Import incrémental des logs Torn via `wsTorn.js`: segmentation 15 min (`INTERVAL = 900`) entre `lastDoc.timestamp+1` et `now`. Progression poussée au client via `{ type:'importProgress', kind:'logs', percent }`. Les handlers d'attaques sont différés tant que l'import n'a pas atteint 100% (voir logique de patch de `socket.send`). Conserver ce mécanisme si vous ajoutez de nouveaux imports dépendants des logs.
- Cache prix & items: DB partagée `TORN` (`Items` collection) + Redis (clé préfixée via `utils/itemsCacheKey.js`). `wsUpdatePrice.js` met à jour Mongo puis propage dans Redis via `JSON.SET` et journalise la variation quotidienne dans une liste `pricevars:YYYYMMDD:<itemId>` (expire 3j). Pour une nouvelle métrique journalière, dupliquez ce pattern: clé dérivée de la date UTC + TTL explicite.
- Averages journaliers: déclenchés via message JSON `{ type:'dailyPriceAverage' }` qui appelle `dailyPriceAverager`. Réutilisez ce style pour tâches batch asynchrones: lancer, répondre `ok:true/false`, log côté serveur plutôt que bloquer le socket.
- Conventions WebSocket: réponses structurées avec `type` miroir de la commande (`updatePrice`, `dailyPriceAverage`, `stopImportAck`). En cas d’erreur, inclure `ok:false` ou `error:<message>`; sinon `ok:true` + données. Préservez ce contrat.

Frontend (`client/`):
- React + Vite modules, séparation par graphes de statistiques (fichiers `*Graph.jsx`, `*Chart.jsx`). Les composants consomment des données (souvent séries temporelles) via IndexedDB (`indexeddbUtils.js`, `storeLogsToIndexedDB.jsx`, `syncItemsToIndexedDB.js`). Suivre ce flux si ajout d’un nouveau graphique: (1) ingestion / sync → (2) stockage local → (3) composant Chart.js avec thèmes (voir `useChartTheme.js` + `chartTheme.js`).
- Découpage Rollup manuel dans `vite.config.js` pour packs vendors (`vendor-react`, `vendor-chart`, `vendor-bootstrap`); si ajout d’un gros vendor, évaluer mise à jour `manualChunks` au lieu d’imports dynamiques aléatoires.

### Patterns & conventions clés
- Module system backend: `type: commonjs` → utiliser `require`/`module.exports` (même si quelques imports ESM côté tooling). Ne mélangez pas `import` dans les handlers backend.
- Lazy require dans `wsHandler.js` pour chaque commande → continuez de charger à la demande (facilite warm start et memory trimming).
- Gestion d’état socket: drapeaux internes (`__importingLogs`, `__logsProgress`, `__deferredTornAttacks`, `__stopImport`) posés directement sur l’objet WebSocket. Pour nouvelle commande longue, réutiliser un préfixe clair (`__importing<Feature>`, `__deferred<DependentFeature>`), envoyer des messages `importProgress` cohérents (au moins tous les ~2% ou à 100%).
- Idempotence & concurrence: opérations de structure DB encapsulées → appelez `ensureUserDbStructure` avant d’insérer dans une collection user si incertain. Indexes créés silencieusement: n’ajoutez pas de logs bruyants.
- Sécurité minimale: commandes critiques testent `req.session.TornAPIKey` (ex: `wsUpdatePrice`, `wsTorn`). Conservez ce guard avant accès API Torn ou modifications Mongo/Redis.
- Erreurs réseau API Torn: pattern de retry simple en ré-incrémentant la boucle (`t -= INTERVAL`) après attendre (~10s). Reproduisez cette stratégie pour nouveaux fetch segmentés.

### Workflows de développement
- Backend: pas de scripts npm définis; lancer directement `node tondatsdubbo.js` (fichier `main`). Ajouter un script si vous introduisez un outil récurrent (ex: `"dev": "node tonstatsdubbo.js"`).
- Tests: Jest configuré mais aucun test `*.test.js` présent; Playwright config côté backend (`tornnode/tests/` avec `test-1.spec.ts`). Front a ses propres tests E2E (`client/tests/*.spec.ts`) exécutables via `npm run test:e2e` dans `client/`.
- Lint front: `npm run lint` (ESLint flat config). Respecter séparation vendors, ne pas introduire d’import circulaire entre graph components.

### Ajout d’une nouvelle commande WebSocket (exemple)
1. Créer `ws/wsNewFeature.js` exportant une fonction `(socket, req, client, fastify, parsed, ...)`.
2. Dans `wsHandler.js`, dans le bloc JSON, router: `else if (parsed.type === 'newFeature') { return require('../ws/wsNewFeature')(socket, req, client, fastify, parsed); }` (lazy require). 
3. Valider session/permissions à l’intérieur du handler, envoyer réponses `{ type:'newFeature', ok:true|false, ... }`.
4. Si process long: utiliser pattern progress `%` + drapeaux socket, éviter blocage event loop (boucles avec pauses 100ms comme `wsTorn`).

### À éviter
- Ne pas convertir massivement en ESM côté backend tant que `type: commonjs` (risque de casser lazy require pattern).
- Ne pas stocker d’état global user hors de Redis/Mongo; privilégier drapeaux éphémères sur le socket.
- Éviter expansions non contrôlées de messages WS >1KB (log de warning déjà en place).

### Points d’attention performance
- Segmentation 15 min réduit charges API; ne pas réduire drastiquement sans justification.
- Redis JSON.SET peut échouer: capturer et log `warn` (pattern existant). Toujours définir TTL si création d’une nouvelle clé journalière/liste.

### Quand modifier ces directives
Mettez à jour ce fichier si: (a) nouveau flux import longue durée, (b) ajout d’un nouveau store front standard, (c) changement de structure multi‑tenant / nom de collections.

---
Feedback bienvenu: indiquez si vous souhaitez plus de détails sur flux front IndexedDB, schémas Mongo, ou stratégies de retry.

### Intégration Mémoire (MCP Memory Server)
Un serveur mémoire MCP est disponible localement sur `http://localhost:9111/memory` pour explorer et enrichir la base de connaissances du projet.

Objectifs:
- Récupérer la liste des entités (handlers WS, utils, composants front, tasks batch, etc.).
- Récupérer / créer des relations (ex: `ws:wsTorn` imports_type `data:collections`, un composant front `uses_hook` un hook, etc.).
- Ajouter de nouvelles entités ou observations pertinentes lors de changements architecturaux.

Endpoints principaux (mêmes conventions que l'extension VS Code memory):
- `POST /create_entities` { namespace?, entities: [ { id|name, entityType, observations[], tags? } ] }
- `POST /create_relations` { relations: [ { type:"relation", from, relationType, to } ] }
- ``POST /read_graph`  pour récupérer les entités + relations; 
- Recherche: si exposé, `/search_nodes` (POST { query }) ou équivalent (adapter selon impl réelle).

Scripts utilitaires déjà présents (backend):
- `npm run memory:index` → Génère / pousse un index d'entités synthétiques (ws handlers, data model, conventions...).
- `npm run memory:entities` → Scanne tous les fichiers (backend + frontend) et produit `memory-entities-input.json` pour ingestion bulk.
- `npm run memory:read` → Tente plusieurs endpoints de lecture et sauvegarde `memory-graphs.json`.
- `npm run memory:relations` → Génère heuristiquement des relations et les pousse via `/create_relations`.

Bonnes pratiques lors de l'ajout d'une nouvelle fonctionnalité:
1. Mettre à jour/relancer `npm run memory:index` (mode delta: `MEMORY_MCP_CHANGED_ONLY=1`).
2. Si nouveaux fichiers significatifs (nouveau handler, grosse util, composant clé): relancer `npm run memory:entities` puis (optionnel) POST bulk via `/create_entities`.
3. Générer de nouvelles relations si le nouveau module dépend explicitement d'une util ou d'un hook (`npm run memory:relations`).
4. Ajouter une observation descriptive (raison de la création, pattern employé) – (si un endpoint `/add_observations` ou équivalent existe, exécuter en POST). À défaut, régénérer l'entité avec une observation enrichie.

Conventions d'entité utilisées localement:
- `ws:*`       → `entityType: ws-handler`
- `data:collections` → `entityType: data-model`
- `batch:*`    → `entityType: batch-task`
- `front:*` ou chemins `client/src/...` → `frontend-component`, `frontend-hook`, `frontend-util`, `frontend-config`
- `conv:conventions` → `entityType: conventions`
- `utils/...`  → `util-backend`

Relations typiques générées (heuristiques script):
- `ws-handler imports_type data-model`
- `ws-handler uses util-backend`
- `frontend-component uses_hook frontend-hook`
- `frontend-component uses_util frontend-util`
- `frontend-config configures frontend-component`
- `batch-task affects data-model`
- `util-backend depends_on data-model`
- `Person works_on Project` (si entités Person/Project présentes)

Quand étendre le graphe mémoire:
- Ajout d'un nouveau flux d'import longue durée (progression, segmentation).
- Refactor majeur des conventions (changer lazy require, TTL cache...).
- Ajout d'un batch récurrent (nouvelle métrique journalière, agrégations supplémentaires).
- Introduction d'un composant front réutilisable critique (ex: bus d'événements, wrapper WebSocket amélioré).

Si le serveur mémoire répond 422 (validation): vérifier champs requis: `name`/`id`, `entityType`, `observations` (array de strings). Adapter scripts avant de réessayer.

Note: Garder les payloads compacts (éviter observations > ~300 chars). Utiliser plusieurs observations courtes plutôt qu'un bloc massif.

—

### Outils Mémoire Avancés (Diff / Playbook / Qualité)
Scripts additionnels pour maintenir la fraîcheur et l'utilité du graphe mémoire:

1. `npm run memory:diff`
	 - Entrées: `memory-index.json`, `memory-entities-input.json`, `memory-graphs.json` (générés préalablement).
	 - Produit: `memory-diff.json` avec:
		 * `missingOnServer` / `extraOnServer` / `hashDiff`
		 * `rankedTop` : priorisation des entités (score amélioré)
		 * Modèle de ranking v2: `score = deg*1.2 + centrality*3 + typeWeight + obsBonus - orphanPenalty`
			 - `deg` = in+out relations
			 - `centrality` = deg/maxDegree
			 - `typeWeight` = pondération métier (data-model>ws-handler>batch>util...)
			 - `obsBonus` = min(observations,5)*0.4 (richesse de contexte)
			 - `orphanPenalty` = 5 si aucune relation
	 - Variable env: `DIFF_TOPN=30` pour élargir le top.

2. `npm run memory:playbook` (script `addPlaybook.js`)
	 - Crée une entité `entityType: playbook` facilitant la capture de procédures répétables.
	 - Usage typique:
		 `npm run memory:playbook -- --title "Ajout d'un import long" --why "Uniformiser pattern de progression" --tag ws --step "Créer ws/wsFeature.js" --step "Router dans wsHandler" --step "Envoyer importProgress"`
	 - Ajoute `observations` = résumé + chaque étape numérotée → améliore la densité d'information exploitable par l'IA.

3. `npm run memory:quality`
	 - Produit `memory-quality.json` calculant:
		 * `coveragePct` (index vs serveur)
		 * `orphanRate` (entités sans relations)
		 * `relationDensity` (relations / entité)
		 * `avgObs` (moyenne observations)
		 * `hashDrift` (hash divergents)
		 * `topCentral` (degree élevé)
		 * `topOrphans` (à relier en priorité)
	 - Fournit `suggestions` conditionnelles pour guider les prochaines actions (générer relations, repush changed-only, etc.).

### Bonnes pratiques d'exploitation
- Après ajout/refactor majeur: `memory:index` → `memory:entities` → `memory:relations` → `memory:diff` → `memory:quality`.
- Réduire les orphelins: introduire relations (mettre à jour heuristiques ou créer manuellement un script ciblé).
- Ajouter un playbook dès qu'une suite d'étapes est répétée >2 fois (ex: ajout d'un ws-handler long, nouvelle métrique Redis TTL, nouveau graphique front basé sur IndexedDB).
- Sur `hashDiff` > 0: relancer `memory:index` avec `MEMORY_MCP_CHANGED_ONLY=1` pour push incrémental.

### Extensions futures suggérées (si besoin)
- Pénalité de staleness: stocker `lastTouched` dans observations pour réviser le ranking.
- Clustering par tag (ex: `perf:*`, `ws:*`) pour générer des playbooks synthétiques.
- Génération automatique de relations script→ws-handler via analyse d'import dynamique dans `routes/wsHandler.js`.

### Staleness (fraîcheur des fichiers)
- Le ranking (`memory:diff`) applique désormais une pénalité `stalePenalty` après 7 jours sans modification (max 5 points soustraits) basée sur l'âge (mtime) des fichiers sources détectés.
- Le rapport qualité (`memory:quality`) expose: `staleness.avgDays`, `medianDays`, `topStale[]` pour planifier refactors/documentation.
- Interprétation rapide:
	* `avgDays` > 14 → code potentiellement en sommeil: vérifier si toujours pertinent.
	* `topStale` > 30 jours sur éléments centraux → envisager audit (tech debt, docs manquantes).
- Stratégie: rafraîchir les entités critiques (ws-handlers, util-backend) avant d'ajouter de nouvelles relations pour éviter que la pénalité oriente mal les priorités.
- Le champ `lastTouched` est ajouté aux entités générées (`memory:index`, `memory:entities`) et reflète `mtime` du fichier source au moment de la génération; il peut être utilisé pour historiser l'évolution ou recalculer une staleness côté serveur.

Ces sections doivent être révisées si le modèle de scoring ou les métriques évoluent.
