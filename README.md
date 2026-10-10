# Orbite — Ma vie en Mind Map

PWA personnelle : Mind Map infinie + tâches + notes, tout relié. Local-first (IndexedDB), synchro cloud optionnelle via Supabase.

## Déploiement (≈ 5 min)

1. **Supabase** (projet ZATHLETE) → SQL Editor → New query → colle `supabase/schema.sql` → Run.
   Crée 3 tables préfixées `lm_` (aucun conflit avec les tables existantes), protégées par RLS : chaque compte ne voit que ses données.
2. **GitHub** : pousse ce dossier dans un nouveau repo (ex. `Zoukari/orbite`).
3. **Vercel** → New Project → importe le repo. Framework détecté : Vite.
   Environment Variables :
   - `VITE_SUPABASE_URL` = Project URL du projet ZATHLETE (Settings › API)
   - `VITE_SUPABASE_ANON_KEY` = clé `anon` ou `sb_publishable_…` du même projet
4. Deploy. Ouvre l’app → Réglages → Synchronisation cloud → « Créer le compte » (une seule fois), puis « Connexion » sur chaque appareil.
   - Si Supabase exige la confirmation d’e-mail : clique le lien reçu, puis connecte-toi dans l’app.

Sans les variables d’environnement, l’app fonctionne 100 % en local (export/import JSON disponibles).

## Développement

```bash
npm install
cp .env.example .env.local   # optionnel
npm run dev
```

## Architecture

| Couche | Choix | Pourquoi |
|---|---|---|
| UI | React 18 + TypeScript + Vite + Tailwind | Rapide, typé, build statique pour Vercel |
| Graph | React Flow (@xyflow/react) | Canvas infini, pinch/zoom, sélection multiple, rendu virtualisé |
| Stockage | Dexie (IndexedDB) | Hors ligne, robuste, autosave à chaque modification |
| Sync | Supabase (Postgres + RLS) | Last-write-wins par entité, curseur serveur `synced_at` |
| État | Zustand | Léger, sélecteurs fins → peu de re-rendus |
| Animations | CSS (keyframes GPU) | Coupées auto au-delà de 140 nœuds visibles ou zoom < 35 % |

### Modèle de données
Tout est une `Entity` (`src/lib/types.ts`) : map, projet, tâche, note, objectif, jalon, personne… avec `parentId` (arborescence), `linkedIds / projectIds / objectiveIds` (relations multiples), `mapId + x/y` (placement optionnel sur une map). Les connexions typées (lié à, dépend de, mène à, référence) sont des `Edge`. Une **référence** (`type: 'ref'`) affiche une autre entité sans la dupliquer : modifier la note modifie le nœud.

### Arborescence
```
src/
  lib/        types, store (actions + relations), db, sync, dates, parser (NL local),
              commands (Command Center), layout, backup/partage, demo, quotes, ai (extension future)
  map/        MapCanvas, EntityNode, RelEdge, Starfield
  components/ DetailPanel, AddToModal, ContextMenu, CommandPalette, QuickCapture,
              RightPanel, Priorities, TaskRow, Overlays (focus, partage, drop…), ui
  views/      Home, Tâches, Notes, Inbox, Projets, Objectifs, Favoris, Maps, Réglages, ShareView
supabase/schema.sql
```

### Ajouter une IA plus tard
`src/lib/ai.ts` expose `setAIProvider()`. Aucun appel API par défaut.

## Raccourcis
`⌘K` recherche / Command Center · `N` capture rapide · `Tab` enfant · `Entrée` frère · `F2` renommer · `Espace` ouvrir · `Suppr` supprimer · `Alt`+glisser : déplacer sans les enfants · double-clic sur le vide : créer.
