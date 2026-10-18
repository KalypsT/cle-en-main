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

À compléter au jalon 0 (installation, dev, tests, bots, build, génération des données).

## Façon de travailler

- Une branche par jalon ou par sujet : `jalon-N-<sujet>`.
- Petites étapes testées, moteur d'abord, interface ensuite.
- Pull request relue avant fusion dans `main`.
- Si une décision de conception change : mettre à jour le chapitre de `docs/` concerné **et** le journal de `docs/10-points-ouverts.md`.

## Maquettes

`docs/maquettes/` contient des **maquettes préliminaires**, faites avant la conception détaillée. Elles donnent une intention, pas une spécification : les écrans peuvent et doivent être améliorés pendant la réalisation. Les chiffres qui y figurent sont illustratifs.
