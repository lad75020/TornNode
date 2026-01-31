# Option A – Déploiement statique unifié (Backend + Front)

Cette option remplace l’ancienne séparation (client/package.json) par **un seul graphe de dépendances** au niveau racine. Le front est compilé via Vite puis *copié tel quel* dans `public/` pour être servi en statique par Fastify.

## Objectifs
- Éliminer la duplication de dépendances et les incohérences de versions (React, Chart.js, etc.).
- Réduire les erreurs SSR / initialisation Vite complexes (`startsWith` / résolution ESM externals).
- Offrir un pipeline simple: `npm install` → `npm run build:static` → `node server.cjs`.
- Garder la possibilité future de réactiver SSR (@fastify/vite) sans réécrire le front.

## Scripts clés
- `npm run build` : build Vite classique (sortie dans `client/dist/` car le `root` Vite pointe sur `client`).
- `npm run build:static` : build puis copie automatique de `client/dist/*` vers `public/` (écrase l’ancien contenu `public/assets`).
- `npm start` : lance Fastify qui sert `public/` (mode statique).

## Arborescence simplifiée
```
/ (racine)
  package.json (unique)
  vite.config.mjs (root + root: 'client')
  client/ (sources React)
  client/dist/ (généré – éphémère, non committé)
  public/ (assets servis – contient la copie finale)
```

## Points techniques importants
1. **JSX Runtime automatique**: configuré pour éviter l’erreur `React is not defined` après minification.
2. **Plus de rollupOptions.external**: toutes les dépendances (idb, react-router-dom…) sont bundlées → pas de 404 module.
3. **Visualisation JSON**: via `jsonview.js` (bundle UMD léger) encapsulé dans un wrapper `JsonPreview.jsx` (import dynamique + fallback <pre>). Pas de dépendance externe supplémentaire.
4. **Sécurité**: rien ne change côté backend (auth, WebSocket, Redis, Mongo). Le front est purement statique.
5. **Performances**: vendor chunk `vendor-react` toujours généré (manualChunks). Possible d’ajouter un chunk `vendor-chart` si la taille grossit.

## Workflow quotidien
```
npm install            # si dépendances modifiées
npm run build:static   # build + copie vers public/
npm start              # ou PM2 / systemd
```

## Retour à un SSR (@fastify/vite) ultérieur
1. Retirer (temporairement) la copie dist→public (ne plus utiliser build:static).
2. Réactiver l’enregistrement `@fastify/vite` dans `server.cjs` (si commenté) et utiliser `await fastify.vite.ready()` après le build côté dev.
3. Lancer: `vite build --ssr` (selon config, adapter vite.config.mjs avec `build.ssr` si nécessaire).
4. Servir via le middleware Vite intégré plutôt que depuis `public/`.

Tant que le besoin SSR (injection dynamique, rendering SEO, etc.) n’est pas critique, la voie statique reste plus stable.

## Avantages mesurés / attendus
- Moins d’artefacts à raisonner (1 lockfile implicite).
- Réduction du risque d’incompatibilité React 18/19 mixte.
- Déploiement reproductible (copie déterministe des assets). 

## Améliorations potentielles (prochaines étapes)
- Ajouter un script `postbuild` pour déclencher automatiquement la copie (si on souhaite uniformiser avec `npm run build`).
- Wrapper JSON: `JsonPreview.jsx` charge paresseusement `jsonview.js`, tronque les grands tableaux (>1500) et fournit un fallback brut en cas d’erreur.
- Générer rapport bundle (analyse taille) via `rollup-plugin-visualizer` conditionnel (ex: `npm run build:analyze`).
- Ajouter un test Playwright basique qui vérifie le chargement de `public/index.html` sans erreurs console.
- Le rendu JSON dans `MoneyGainedGraph` utilise `JsonPreview.jsx` + `jsonview.js` (limitation tableaux 1500 éléments + objet sentinelle de troncature).

## FAQ
**Pourquoi ne pas supprimer totalement `public/` et servir directement `dist/` ?**  
On garde `public/` comme dossier stable (favicon, images, sons). La copie fusionne les assets front dans cette racine unique.

**Dois-je committer `dist/` ?**  
Non. Seul `public/` est consommé en production. Assurer que `dist/` est dans `.gitignore` (à vérifier si déjà présent).

**Quid des mises à jour dépendances ?**  
Mettre à jour au niveau racine, rebuild, copier. Pas besoin d’entrer dans `client/` pour installer.

---
Dernière mise à jour: (Option A) – unification validée et stable.
