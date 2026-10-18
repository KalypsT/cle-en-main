# 10. Points ouverts et journal des décisions

## Points ouverts

| # | Sujet | À trancher avant | Notes |
|---|---|---|---|
| 1 | **Quartiers de Dole** : profil de chacun | Jalon 1 (données), au plus tard jalon 4 | **Liste validée le 2026-10-18** : Centre historique, Les Mesnils Pasteur, Les Paters, Plumont – Val Fleuri, Azans. Profils à tirer des données (jalon 1b). |
| 2 | **Coûts de travaux réels** par poste et par gamme | Jalon 3 | À rechercher sur des prix réels 2026 |
| 3 | **Marges des banques** | Jalon 1c (bots) | **Taux de départ tranché le 2026-10-18** : 3,65 % sur 20 ans hors assurance (baromètres d'octobre 2026), plus 0,30 point d'assurance. Marges indicatives dans `content/banques.json`, à calibrer par les bots. |
| 4 | **Règles fiscales** exactes (barème, régimes, plus-value, IFI) | Jalon 2 | Revérifier la loi en vigueur |
| 5 | **Seuils exacts** des titres, de la réputation, des succès | Jalon 6 | Calibrés par les bots |
| 6 | **Villes après la Bourgogne-Franche-Comté** | Jalon 9 | Éviter l'Alsace-Moselle (pas de données DVF) ou prévoir une autre source |
| 7 | **Musique** | Jalon 5 | Fournie par Thibaud (4 emplacements) |
| 8 | **Format exact des événements** en JSON | Jalon 6 | Exemple indicatif dans [03-systemes/07-evenements.md](03-systemes/07-evenements.md) |
| 9 | **Régime de la SCI** (IR ou IS) | Jalon 8 | À simplifier |
| 10 | **Titre définitif** du jeu | Avant le jalon 9 | *Clé en main !* est le titre provisoire |
| 11 | **Apport du nouveau départ** après faillite et part de réputation conservée | Jalon 6 | Valeurs proposées : 5 000 € et 50 % |

## Journal des décisions

Chaque changement de décision en cours de réalisation est noté ici (date, décision, raison, chapitres mis à jour).

| Date | Décision | Raison | Chapitres |
|---|---|---|---|
| 2026-10-18 | Conception initiale validée (chapitres 1 à 9) | — | Tous |
| 2026-10-18 | Jalon 0 : versions de base — Node 22 LTS, pnpm 10.28, TypeScript 6.0 (strict ; la 7.0 n'est pas encore prise en charge par typescript-eslint), Vite 8, React 19, Vitest 5, Playwright 1.64, ESLint 10 + typescript-eslint 8, Prettier 3, zod 4, PixiJS 8 (installé, pas encore utilisé) | Versions stables du moment, compatibles entre elles | 07 |
| 2026-10-18 | Jalon 0 : bibliothèques ajoutées — vite-plugin-pwa (manifeste et service worker Workbox), idb (petite surcouche d'IndexedDB), @fontsource-variable/manrope (police embarquée, donc disponible hors ligne), tsx (exécuter les scripts TypeScript sans build) | Besoins du jalon 0, dépendances légères | 07 |
| 2026-10-18 | Pas de Zustand pour l'instant : la liaison moteur ↔ interface passe par `useSyncExternalStore` de React et une petite classe de session | Une seule source d'état à observer ; à réévaluer au jalon 4 | 07 |
| 2026-10-18 | Hasard : xoshiro128** initialisé par splitmix32 ; état = 4 entiers 32 bits stockés dans l'état du monde | Rapide, bien étudié, sérialisable en JSON | 07 |
| 2026-10-18 | Calendrier du moteur codé en arithmétique entière (sans objet `Date`) ; la date de départ est fournie par l'application (date du téléphone) et la partie commence à 8 h (`content/temps.json`) | Déterminisme et indépendance au fuseau horaire | 07, 03/01 |
| 2026-10-18 | Le moteur reçoit le contenu en paramètre ; l'application importe le contenu JSON au moment du build | Fonctionne hors ligne, moteur testable seul | 07 |
| 2026-10-18 | Sauvegarde automatique dans l'emplacement courant le 1er de chaque mois ; les 6 points mensuels de retour en arrière sont prévus dans le format (`checkpoints`) mais remplis à partir du jalon 4 | Socle posé sans anticiper le gameplay | 07, 02 |
| 2026-10-18 | Quartiers de Dole : la liste proposée de 5 quartiers est retenue | Choix de Thibaud | 10 |
| 2026-10-18 | Taux de marché de départ : 3,65 % sur 20 ans (hors assurance), écart selon la durée (−0,15 point à 15 ans, +0,10 point à 25 ans), assurance de 0,30 point incluse dans le taux affiché ; évolution mensuelle par un cycle lent (8 ans), un rappel vers la moyenne et un bruit | Baromètres d'octobre 2026 ; règle « assurance incluse » du chapitre 3.2 | 03/02 |
| 2026-10-18 | **Train de vie** : des dépenses de vie mensuelles (hors loyer) suivent le salaire, de sorte que l'épargne de salaire reste faible (environ 100 à 250 € par mois selon le métier) ; minimum de 900 € sans emploi | La doc ne définissait pas les dépenses du personnage ; sans elles, le bot Inactif s'enrichirait | 03/01 |
| 2026-10-18 | Les flux mensuels (salaire, loyer, dépenses de vie, mensualités) passent le 1er du mois ; les agios du découvert sont calculés chaque jour | Simplicité et lisibilité du bilan mensuel | 03/01, 03/02 |
| 2026-10-18 | Salaire variable (commercial, agent immobilier) : salaire fixe plus une prime mensuelle tirée au hasard, dont la moyenne donne le revenu moyen du chapitre 3.1 ; les banques retiennent le revenu moyen | Règle simple, la variabilité pèse via la confiance bancaire plus faible | 03/01 |
| 2026-10-18 | Temps libre au jalon 1 : semaine et week-end selon le métier ; cycle de garde de l'infirmier (travail, travail, repos, repos) ; **vacances scolaires et RTT reportées au jalon 6** (agenda complet) | Le calendrier scolaire demande des données ; le jalon 6 traite l'agenda | 03/01 |
| 2026-10-18 | Banques : règles chiffrées indicatives dans `content/banques.json` et `content/credit.json` (marges, délais de réponse, dérogations jusqu'à 37–40 % selon la confiance, accord partiel si au moins 50 % du montant, Rigueur exige un profil « élevé » et une confiance de 50, ZéroPapier sans dérogation ni rendez-vous) | Valeurs de départ à calibrer par les bots | 03/02 |
| 2026-10-18 | Moteur : l'argent est stocké en centimes entiers ; l'API devient `createEngine(contenu)` qui fournit `createGame`, `tick`, `dispatch`, `loadGame` et des requêtes (taux, simulation de prêt) ; format de sauvegarde v2 avec migration depuis la v1 du jalon 0 ; l'action de démonstration est retirée | Pas d'erreurs d'arrondi ; contenu fourni en paramètre | 07 |
