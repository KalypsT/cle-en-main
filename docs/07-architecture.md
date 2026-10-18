# 7. Architecture technique

## 7.1 Stack

| Besoin | Choix |
|---|---|
| Langage | TypeScript (strict) |
| Gestion du monorepo | pnpm (workspaces) |
| Build et serveur de dev | Vite |
| Écrans de gestion | React |
| Rue vivante et coupe d'immeuble | PixiJS (WebGL) : éclairage, particules (pluie, neige, poussière), animations fluides |
| Liaison moteur ↔ interface | petit store (par exemple Zustand) abonné à l'état du moteur |
| Validation du contenu | zod |
| Hors ligne et installation | PWA (par exemple vite-plugin-pwa) |
| Sauvegardes | IndexedDB (par exemple via idb) |
| Tests | Vitest (moteur), Playwright (fumée de l'interface) |
| CI et déploiement | GitHub Actions, GitHub Pages |

Les versions exactes sont fixées au jalon 0.

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
- PWA installable, fonctionnant hors ligne.

## 7.5 Les sauvegardes

- Stockées dans **IndexedDB** : 3 emplacements, chacun avec la partie courante et ses **6 points mensuels** de retour en arrière.
- **Export et import** en fichier JSON.
- **Format versionné** avec des **migrations** : une mise à jour du jeu ne casse pas une partie en cours.
- **Journal de partie** : les événements et les décisions sont enregistrés localement, exportables pour l'analyse de l'équilibrage (voir [08-equilibrage.md](08-equilibrage.md)).

## 7.6 Les tests

- **Moteur** : tests unitaires Vitest par système, plus des **parties de référence** (« graines dorées ») dont le résultat après N années est figé et vérifié.
- **Contenu** : validation par schémas à chaque compilation.
- **Bots** : lancés en CI sur un échantillon de graines, avec alerte si une cible d'équilibrage est dépassée.
- **Interface** : un test Playwright vérifie que le jeu démarre, qu'une partie se crée et qu'une sauvegarde se recharge.

## 7.7 Le déploiement

- Repo **public** sur GitHub (`KalypsT/cle-en-main`).
- GitHub Actions : installation, vérification des types, tests, bots (échantillon), build, puis déploiement sur **GitHub Pages** (source : GitHub Actions).
- Adresse publique non référencée.

## 7.8 Conventions de code

- Code, identifiants et commentaires techniques **en anglais** ; textes affichés, contenu et documentation **en français**.
- Tous les textes affichés viennent de `content/` (pas de texte en dur dans les composants).
- Les détails et règles de travail pour Claude Code sont dans [`CLAUDE.md`](../CLAUDE.md).
