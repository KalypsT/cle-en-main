# CLAUDE.md — Clé en main !

Jeu de gestion immobilière en temps réel, PWA mobile (portrait), en français, joué en solo dans des villes françaises réelles (départ à Dole). Usage privé.

## Avant toute tâche

1. Identifier le **jalon** concerné (voir `docs/09-feuille-de-route.md`).
2. Lire **uniquement** les chapitres listés pour ce jalon dans `docs/README.md` (section « Que lire selon le jalon »).
3. En cas de doute sur une règle de jeu, la documentation fait foi. Si elle est muette ou contradictoire, **demander** plutôt qu'inventer, et proposer une mise à jour de la doc.

## Architecture (résumé, détail dans `docs/07-architecture.md`)

- Monorepo **pnpm** : `packages/engine` (moteur, TypeScript pur), `packages/bots`, `apps/game` (React + PixiJS + Vite, PWA), `content/` (JSON écrit à la main), `data/` (JSON généré), `tools/data/` (scripts de données).
- L'interface **ne calcule rien** : elle lit l'état du moteur et envoie des actions (`dispatch`).

## Règles impératives

- **Le moteur ne dépend d'aucune interface** : aucun import de React, PixiJS, du DOM ou d'API navigateur dans `packages/engine`.
- **Déterminisme** : dans le moteur, aucun `Math.random()`, aucun `Date.now()` / `new Date()` sans argument. Utiliser le générateur à graine et l'horloge de jeu.
- **Pas de chiffre de gameplay en dur dans le code** : taux, coûts, probabilités, seuils et textes vivent dans `content/` et sont validés par des schémas zod.
- **Pas de texte affiché en dur** dans les composants : tout texte joueur vient de `content/`.
- **L'état du monde reste sérialisable** (JSON) : pas de classes avec état caché, pas de fonctions dans l'état.
- Toute évolution du format de sauvegarde s'accompagne d'une **migration** et d'un test.
- Le jeu fonctionne **hors ligne** et sans serveur.

## Langues

- Code, identifiants, commentaires techniques, messages de commit : **anglais**.
- Textes du jeu, contenu, documentation : **français**.

## Tests et qualité

- Chaque système du moteur a ses tests Vitest.
- Les **parties de référence** (graines dorées) ne doivent pas changer sans raison : si un changement de règle les modifie, mettre à jour la référence **et** expliquer pourquoi dans la PR.
- Après une modification d'équilibrage ou de règle, lancer les bots et joindre le résumé du rapport à la PR.
- Vérifier les types (`tsc`) et les tests avant chaque commit.

## Commandes

Prérequis : Node 22 LTS (`.nvmrc`) et pnpm 10 (`corepack enable` suffit, la version est fixée par `packageManager`).

| Commande | Rôle |
|---|---|
| `pnpm install` | Installer les dépendances de tout le monorepo |
| `pnpm dev` | Lancer le jeu en développement (http://localhost:5173/cle-en-main/) |
| `pnpm build` | Construire la PWA dans `apps/game/dist` |
| `pnpm preview` | Servir le build (http://localhost:4173/cle-en-main/), service worker compris |
| `pnpm test` | Tests Vitest de tous les paquets (moteur, contenu, bots, session du jeu) |
| `pnpm test:e2e` | Tests Playwright de fumée (construit puis sert le jeu) |
| `pnpm typecheck` | Vérifier les types (`tsc`) de tous les paquets |
| `pnpm lint` | ESLint, puis vérification Prettier |
| `pnpm format` | Reformater avec Prettier |
| `pnpm validate-content` | Valider tous les JSON de `content/` avec leurs schémas zod |
| `pnpm bots --seed 1 --days 3650 [--bot chasseur]` | Simuler une partie sans interface (jouée par un bot avec `--bot`) et afficher un résumé |
| `pnpm bots:series --games 1000 --years 10 --out rapport.md` | Rapport d'équilibrage : chaque bot joue la série (parallèle sur les cœurs), comparé aux cibles du chapitre 08 |
| `pnpm bots:series --bots chasseur --games 1000 --raw chasseur.json` | Série d'un seul bot, avec les mesures de chaque partie écrites dans `chasseur.json` ; utile quand une série complète dépasse 2 heures |
| `pnpm bots:series --from a.json,b.json --out rapport.md` | Fusionner des séries `--raw` en un rapport, sans simuler |
| `pnpm --filter @cle/data-tools build-city dole` | Régénérer `data/cities/dole.json` depuis les sources publiques (téléchargements en cache dans `tools/data/.cache/`) |

- **Rapport d'équilibrage** : une partie de bot de 10 ans prend 7 à 9 s (le moteur seul, 3,8 s) ; 100 parties d'un bot prennent environ 3 minutes et demie sur 4 cœurs, 1 000 parties environ 22 à 35 minutes par bot (11 bots depuis le jalon 8) ; une partie de 25 ans prend environ 15 s pour le Chasseur et 27 s pour le Promoteur (300 parties : 19 et 34 minutes) : découper par bot (`--bots`, `--raw`) puis fusionner (`--from`, en redonnant `--years` : sans lui, la fusion juge des parties de 10 ans). `--games 100` suffit pour un premier coup d'œil. Le dernier rapport complet est rangé dans `packages/bots/rapports/`.
- **Graine dorée** : si un changement de règle modifie la partie de référence, relancer `pnpm --filter @cle/engine exec vitest run -u`, vérifier le diff de `packages/engine/test/golden/` et l'expliquer dans la PR.
- **Nouveau fichier de contenu** : écrire son schéma dans `content/schemas/`, le déclarer dans `content/registry.ts` (sinon `validate-content` échoue), l'exporter depuis `content/index.ts`.
- **Format de sauvegarde** : incrémenter `FORMAT_VERSION` (`packages/engine/src/state.ts`), ajouter la migration dans `MIGRATIONS` (`serialization.ts`) et son test.
- **Playwright avec un Chromium déjà installé** : `PW_CHROMIUM_PATH=/chemin/vers/chrome pnpm test:e2e`.
- **Icônes provisoires** : modifier `apps/game/public/icons/icon.svg`, puis `pnpm --filter @cle/game exec tsx scripts/generate-icons.ts`.

## Façon de travailler

- Une branche par jalon ou par sujet : `jalon-N-<sujet>`.
- Petites étapes testées, moteur d'abord, interface ensuite.
- Pull request relue avant fusion dans `main`.
- Si une décision de conception change : mettre à jour le chapitre de `docs/` concerné **et** le journal de `docs/10-points-ouverts.md`.

## Maquettes

`docs/maquettes/` contient des **maquettes préliminaires**, faites avant la conception détaillée. Elles donnent une intention, pas une spécification : les écrans peuvent et doivent être améliorés pendant la réalisation. Les chiffres qui y figurent sont illustratifs.
