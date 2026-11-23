# 7. Architecture technique

## 7.1 Stack

| Besoin | Choix |
|---|---|
| Langage | TypeScript (strict) |
| Gestion du monorepo | pnpm (workspaces) |
| Build et serveur de dev | Vite |
| Écrans de gestion | React |
| Rue vivante et coupe d'immeuble | PixiJS (WebGL) : éclairage, particules (pluie, neige, poussière), animations fluides |
| Liaison moteur ↔ interface | petite session abonnée à l'état du moteur, lue par `useSyncExternalStore` (Zustand si le besoin apparaît) |
| Validation du contenu | zod |
| Hors ligne et installation | PWA via vite-plugin-pwa |
| Sauvegardes | IndexedDB via idb |
| Tests | Vitest (moteur), Playwright (fumée de l'interface) |
| CI et déploiement | GitHub Actions, GitHub Pages |

Les versions exactes ont été fixées au jalon 0 : voir le journal des décisions de [10-points-ouverts.md](10-points-ouverts.md) et les `package.json`.

## 7.2 Organisation du repo

```
cle-en-main/
├── CLAUDE.md              conventions pour les sessions Claude Code
├── docs/                  ce document de spécifications, maquettes
├── packages/
│   ├── engine/            moteur de simulation (TypeScript pur, sans DOM)
│   └── bots/              stratégies, lanceur CLI, rapports d'équilibrage
├── apps/
│   └── game/              PWA : React (gestion) + PixiJS (rue, coupe)
├── content/               contenu écrit à la main (JSON validé)
├── data/                  données générées par les scripts (JSON par ville)
└── tools/
    └── data/              scripts de données (DVF, loyers, INSEE, ADEME, OSM)
```

## 7.3 Le moteur (`packages/engine`)

- **Sans dépendance à l'interface** : aucun import de React, PixiJS ou du DOM. Il tourne aussi bien dans le navigateur que dans Node (bots, tests).
- **État du monde** : un objet sérialisable (JSON) qui contient tout (personnage, biens, crédits, locataires, chantiers, marché, rivaux, file d'événements, horloge, graine du hasard).
- **Pas de temps** : heure par heure pour l'agenda, jour par jour pour l'économie. `tick()` fait avancer le monde d'une heure.
- **Systèmes** : un module par système (temps, personnage, banque, marché, location, travaux, copropriété, fiscalité, événements, rivaux, réputation, villes), appelés dans un ordre fixe à chaque pas.
- **API d'actions** : `dispatch(action)` pour toutes les décisions du joueur ou des bots (faire une offre, demander un prêt, lancer un chantier…). Chaque action est validée et renvoie un résultat lisible (succès ou raison du refus).
- **Déterminisme** :
  - un générateur aléatoire à graine (par exemple de type PCG ou xoshiro), seul source de hasard ;
  - aucun `Math.random()`, aucun `Date.now()` dans le moteur ;
  - à graine et actions identiques, résultat identique.
- **Explicabilité** : les calculs financiers renvoient leur détail (pour l'affichage « pourquoi ce montant ? »).
- **Performance** : le moteur doit pouvoir simuler 10 ans de jeu en quelques secondes dans Node, pour les bots. Il tourne dans le fil principal au départ, avec une API compatible avec un Web Worker si besoin.

## 7.4 L'application (`apps/game`)

- React pour tous les écrans de gestion, PixiJS dans un composant dédié pour la rue et la coupe.
- L'interface **ne calcule rien** : elle lit l'état du moteur et envoie des actions.
- Mise en page adaptative : portrait sur téléphone, deux colonnes sur grand écran, panorama pour la rue en paysage.
- PWA installable, fonctionnant hors ligne (build GitHub Pages).
- **DomoThib Games** (étape G4 du plan Jeux de DomoThib ; contrat dans [domothib.md](domothib.md), bibliothèque du pont copiée sans changement dans `apps/game/src/domothib/domothib-games.ts`) : un second build, `pnpm build:domothib` (`vite build --mode domothib`, même base `/cle-en-main/`, sortie dans `apps/game/dist/`) :
  - ni `vite-plugin-pwa`, ni service worker, ni manifeste d'application ; le module `virtual:pwa-register/react` est remplacé par un module inerte (`src/domothib/no-pwa-register.ts`), et l'interface n'affiche ni la note « hors ligne », ni le bandeau de mise à jour, ni « Rechercher une mise à jour » (`DOMOTHIB_BUILD`, `src/domothib/mode.ts`) ;
  - le manifeste `public/domothib.json` (identifiant `cle-en-main`, sauvegardes sur le serveur, orientation libre, téléphone et tablette, tactile, poignée en bas à gauche) et la jaquette `public/jaquette.webp` (640 × 360, provisoire : une capture de la rue avec le logo) ; un test vérifie le manifeste et la jaquette ;
  - au démarrage, `connectDomoThib()` avant toute lecture d'emplacement (`src/domothib/host.ts`) ; la pause de DomoThib arrête l'horloge (`session.hold()`), le son (`AudioMixer.setPaused`) et le dessin de la rue, et sauvegarde la partie ; la reprise relance tout ;
  - la poignée de DomoThib (40 px à 8 px des bords) est en bas à gauche : sur un écran de moins de 592 px de large, la barre d'onglets et les feuilles laissent 56 px libres dans ce coin (`html.domothib`, `styles.css`) ; ailleurs, le coin tombe sur la rue ou la marge ;
  - le cadre de DomoThib bloque `window.confirm` et les téléchargements : les confirmations se font dans une feuille du jeu (`askConfirm`, `src/ui/confirm.tsx`, dans les deux builds) et les boutons d'export (partie, journal) sont masqués dans DomoThib (`CAN_DOWNLOAD`) ; l'import d'un fichier reste ;
  - l'écran titre a un bouton « Quitter » qui appelle `domothib.quit()` ; « Retour à l'écran titre » reste dans le jeu ;
  - PixiJS génère par défaut du code avec `new Function`, interdit par la politique de sécurité de l'hôte : le build DomoThib charge `pixi.js/unsafe-eval` avant de créer la scène.
- **Monde vivant (jalon 5)**, dans `apps/game/src/world/` :
  - le moteur fournit des **requêtes en lecture seule** (`engine.ambience`, `engine.streets`, `engine.section`, `engine.building`, dans `packages/engine/src/systems/world.ts`) : moment de la journée, saison, météo, rues d'un quartier avec leurs bâtiments et leurs bulles, coupe d'un bâtiment. Elles lisent `content/monde.json` et des hachages stables de la graine et des identifiants : rien n'est ajouté à la sauvegarde, rien n'est tiré dans le générateur de la partie ;
  - `facade.ts` décrit une façade par modules, `shapes.ts` la traduit en formes simples, dessinées en PixiJS dans la rue et en SVG sur les fiches (même bâtiment des deux côtés) ;
  - `StreetScene.ts` (PixiJS 8, WebGL avec repli sur le rendu Canvas de PixiJS) dessine ciel, silhouette de la ville, façades, mobilier urbain, lumières, passants, voitures, oiseaux et météo ; une couche HTML défilante au-dessus porte les bulles et un bouton par bâtiment (accessibles, testables) ;
  - la scène est créée une fois par partie et mise en pause hors de l'onglet Rue ou quand l'application passe en arrière-plan ;
  - **qualité graphique** Haute, Économie ou Automatique : en automatique, si les images restent plus lentes que 45 par seconde pendant 3 secondes, la scène baisse d'un cran (résolution, nombre de passants et de particules, 30 images par seconde au plus) ; « réduire les animations » du téléphone fige les passants et la météo ;
  - la coupe (`screens/SectionScreen.tsx`) est un SVG dessiné par le code, avec un bouton par logement.
- **Son (jalon 5)**, dans `apps/game/src/audio/` : un mixeur Web Audio à trois volumes (musique, ambiances, effets), démarré au premier toucher. Ambiances et effets sont **synthétisés** (aucun fichier) ; la musique lit les fichiers déclarés dans `content/musique.json`, mis en cache par le service worker.

## 7.5 Les sauvegardes

- **Interface de stockage** `SaveStorage` (`apps/game/src/storage/save-storage.ts`) et deux implémentations, choisies au démarrage : `IndexedDbSaveStorage` (le navigateur, hors de DomoThib ou quand `domothib.saves` vaut `null`) et `DomoThibSaveStorage` (le serveur de DomoThib). `storage/saves.ts` sérialise la partie et passe par celle qui est choisie. Le dernier emplacement joué, les réglages et la note « hors ligne » restent dans le `localStorage` : ils sont propres à l'écran.
- Stockées dans **IndexedDB** : 3 emplacements, chacun avec la partie courante et ses **6 points mensuels** de retour en arrière.
- **Sur le serveur de DomoThib** (une valeur texte par clé, par joueur ; limites : 2 Mio par valeur, 200 entrées, 20 Mio au total) :
  - clés `slot-<n>` (la partie), `checkpoint-<n>-<AAAA-MM-JJ>` (un point de retour), `journal-<n>-<k>` (le k-ième morceau du journal, 2 000 lignes, 1 Mo avant compression au plus) ;
  - chaque valeur est une ligne d'en-tête en JSON clair (date de jeu, patrimoine net, nombre de lignes : ce que listent les écrans), puis la donnée **compressée en gzip et codée en Base64** (`CompressionStream`) ; sans `CompressionStream`, la donnée est gardée telle quelle ;
  - les clés sont listées une fois au démarrage (DomoThib connaît alors leurs révisions : pas de conflit sur une sauvegarde qu'il n'a pas vue) ; un nouveau jeu dans un emplacement, ou sa suppression, retire ses points et son journal ; un retour en arrière retire les points plus récents ;
  - **mesures** (`pnpm --filter @cle/bots save-sizes --bot chasseur --years 25`) : à 25 ans, une partie sérialisée pèse jusqu'à 1,9 Mio (au-delà de 2 Mio vers 27 ans : la compression est indispensable), 165 Kio en gzip, **220 Kio sur le serveur** ; les 20 000 dernières lignes du journal pèsent 2,8 Mio, **0,3 Mio** une fois compressées en 10 morceaux ; un emplacement complet (partie, 6 points, journal) prend **1,8 Mio** (2,8 Mio à 40 ans) ; trois emplacements, 5,5 Mio et 54 entrées au plus ;
  - **plafonds** : un emplacement garde 6 Mio au plus (trois font 18 Mio, 2 Mio de marge pour les écritures en vol) ; au-delà, les plus vieux morceaux du journal partent d'abord (le morceau ouvert reste), puis les plus vieux points de retour ; le journal garde ses 11 derniers morceaux ; 1 + 6 + 11 = 18 entrées par emplacement, 54 pour trois.
- **Export et import** en fichier JSON.
- **Format versionné** avec des **migrations** : une mise à jour du jeu ne casse pas une partie en cours.
- **Version 6 (jalon 3)** : pièces et postes des biens, chantiers, devis, enveloppe travaux, copropriété, carnet d'artisans. La migration depuis la v5 tire les postes autour de l'ancien état global par des tirages stables (hachage de la graine et de l'identifiant du bien), sans toucher à l'état aléatoire du monde.
- **Performance** : les pièces et les postes d'un bien sont remplacés, jamais modifiés ; ils sont **gelés** (`Object.freeze`) et partagés entre les copies de l'état (`clone.ts`), ce qui garde le coût d'une journée et d'une action raisonnable, et leurs valeurs dérivées (état pondéré, vue du joueur) restent en cache.
- **Version 21 (plaisir de jeu, lot 4)** : chaque projet de travaux garde la photo du bien au départ (`before`), chaque bien le dernier chantier terminé (`lastWorks` : avant et après). La migration depuis la v20 met `before` à `null` sur les chantiers en cours et `lastWorks` à `null` partout. La partie de référence ne gagne que ces champs.
- **Version 8 (jalon 6)** : mode de partie, compteur de retours, fin de partie, progression (titres, succès, compteurs, records, défi), chronique, événements en attente et anecdotes récentes, dernier bilan annuel, agenda à plusieurs types d'actions, loyers et réputation dans la courbe mensuelle. La migration depuis la v7 met la partie en mode Classique, lui donne le titre de départ et des compteurs tirés de ce qu'elle possède (le passé n'est pas rejoué) ; les titres et succès déjà mérités arrivent le lendemain.
- **Points de retour en arrière** : rangés dans l'emplacement de sauvegarde, pas dans l'état du moteur (date, patrimoine net, partie sérialisée) ; le moteur fournit `rewind(partie, point)`.
- **Journal de partie** : les événements du moteur (sauf les plus fréquents : jours, prix, taux) et les actions du joueur sont enregistrés par emplacement (IndexedDB, ou le serveur de DomoThib en morceaux), par lots, en gardant les 20 000 dernières lignes ; exportables depuis les Réglages (une ligne JSON par entrée) pour l'analyse de l'équilibrage (voir [08-equilibrage.md](08-equilibrage.md)).

## 7.6 Les tests

- **Moteur** : tests unitaires Vitest par système, plus des **parties de référence** (« graines dorées ») dont le résultat après N années est figé et vérifié.
- **Contenu** : validation par schémas à chaque compilation.
- **Bots** : lancés en CI sur un échantillon de graines, avec alerte si une cible d'équilibrage est dépassée.
- **Interface** : des tests Playwright vérifient que le jeu démarre, qu'une partie se crée et qu'une sauvegarde se recharge, le parcours jusqu'au premier bien loué (jalon 4) et le monde vivant (jalon 5 : rue, bulle, coupe, nuit, thème sombre, panorama, mesure indicative de la fluidité). `CAPTURES=1 pnpm test:e2e` range les captures en 390 × 844 dans `docs/captures/`.

## 7.7 Le déploiement

- Repo **public** sur GitHub (`KalypsT/cle-en-main`), privé à la bascule vers DomoThib Games.
- GitHub Actions : installation, vérification des types, tests, bots (échantillon), build, puis déploiement sur **GitHub Pages** (source : GitHub Actions), jusqu'à la bascule.
- **DomoThib Games** : sur un push dans `main` seulement, le job `check` fait aussi le build DomoThib (après avoir gardé celui de Pages) et le passe au job `domothib`, qui vérifie `domothib.json` (protocole 1, identifiant `cle-en-main`) et l'envoie par rsync sur l'hôte des jeux (`jeux-deploy@VPS_HOST:./`, secrets `JEUX_SSH_KEY`, `VPS_HOST`, `VPS_KNOWN_HOSTS`), sans réinstaller ni reconstruire. Une pull request n'exécute que la CI habituelle. Sur `main`, une exécution n'en annule plus une autre en cours (un déploiement n'est jamais coupé à moitié).
- Adresse publique non référencée.

## 7.8 Conventions de code

- Code, identifiants et commentaires techniques **en anglais** ; textes affichés, contenu et documentation **en français**.
- Tous les textes affichés viennent de `content/` (pas de texte en dur dans les composants).
- Les détails et règles de travail pour Claude Code sont dans [`CLAUDE.md`](../CLAUDE.md).

## 7.7 Jalon 7 : plusieurs villes

- **Version 9 de la sauvegarde** : `player.baseCityId` (ville de la résidence principale), `player.tripsToday` (villes déjà visitées ce jour, vidées chaque matin), `player.lastMoveDay` et `player.renown` (notoriété par ville). La migration depuis la v8 place le joueur à Dole (ou dans la ville de son logement), sans notoriété, et donne aux villes ajoutées leurs niveaux de prix et un premier stock d'annonces tiré de l'état aléatoire de la sauvegarde ; le marché de Dole est laissé intact. Test : `packages/engine/test/fixtures/save-v8-milestone-6.json`.
- **Version 10 (jalon 8)** : la SCI (`company`), le détenteur de chaque achat et de chaque bien (`holder`), l'IFI de l'avis d'impôt, l'arrivée des rivaux tardifs (`arrivedDay`), les crises en cours (`market.crises`), les combles aménageables des maisons (`atticSurface`), les jours manqués d'une courte durée (`missedDays`), les chantiers du maître d'œuvre et les transformations, les nouveaux types de biens (sans pièces). La migration depuis la v9 met tout à zéro ou en nom propre (une maison d'une ancienne sauvegarde n'a pas de combles aménageables) ; elle est testée sur une vraie sauvegarde du jalon 7 (`test/fixtures/save-v9-milestone-7.json`).
- **Annonces figées** : le marché compte maintenant plusieurs centaines d'annonces. Elles sont **gelées entre deux pas du moteur** (`freezeListings`) et partagées entre les copies de l'état ; un système qui doit en modifier une la copie d'abord (`editableListing`). Les lots, nuisances, aléas reportés et copropriété d'un bien sont gelés eux aussi. La valeur réelle d'une annonce gelée est mémorisée. Sans cela, dix ans de jeu prenaient 7,5 s ; ils en prennent 3,8 s (test `simulates ten years in a few seconds`).
- **Caches des annonces gelées (jalon 8)** : une annonce gelée ne change jamais ; le moteur mémorise son catalogue de travaux (selon le métier du joueur, pour le « faire soi-même »), ses vues après travaux (gelées à leur tour), son estimation au niveau de prix du quartier, et indexe les pièces par identifiant. Les bots mémorisent leur évaluation de chaque annonce gelée, recalculée seulement quand changent l'indice de prix du quartier, leur projet de travaux pour elle ou les dates d'interdiction DPE passées ; le choix des postes à refaire est gardé tant que les postes du bien ne changent pas. Les résultats sont identiques au calcul à neuf (test `frozen-caches.test.ts`, et une série de 300 parties identique à l'unité près) ; une partie de bot de 10 ans passe de 12 à 22 s à 7 à 9 s.
- `systems/travel.ts` (trajets et temps), `systems/cities.ts` (déménagement, notoriété, frais à distance), `systems/city-views.ts` (fiches de ville et devis de visite pour l'interface).
