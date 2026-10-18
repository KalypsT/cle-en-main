# 6. Données

Principe : **de vraies données publiques**, traitées par des scripts, livrées au jeu sous forme de **petits fichiers JSON**. Aucun serveur.

## 6.1 Les sources réelles (ouvertes)

| Source | Usage dans le jeu |
|---|---|
| **DVF** (Demandes de valeurs foncières, data.gouv.fr) | Prix de vente réels, volumes de ventes par commune et par type de bien : calage des prix au m² et du flux d'annonces |
| **Carte des loyers** publiée par l'État | Loyers par commune et par type de logement |
| **INSEE** | Population, part d'étudiants, découpage infracommunal (IRIS) : base des quartiers et de leurs contours |
| **Base DPE de l'ADEME** | Répartition réelle des classes énergétiques selon la commune et l'époque de construction |
| **Cadastre de l'IGN** (Parcellaire Express) | Position de chaque vente DVF (par sa parcelle), pour la placer dans son IRIS et donc son quartier |
| **BD TOPO de l'IGN** | Rivières, canaux, grands axes, voies ferrées, parcs, repères et équipements (écoles, santé, commerces, loisirs) pour la carte de la ville |

Toutes ces sources sont sous Licence Ouverte Etalab 2.0 : la mention des sources est inscrite dans chaque fichier de ville (`attribution`) et devra s'afficher dans le jeu.

Limite connue : DVF ne couvre pas l'Alsace et la Moselle.

> **Décision du jalon 1b** : OpenStreetMap (Overpass) n'était pas accessible depuis l'environnement de développement. La **BD TOPO de l'IGN** le remplace : elle contient tout ce dont la carte a besoin, avec une licence plus simple. La version géolocalisée de DVF (geo-dvf) n'étant pas accessible non plus, les ventes sont placées grâce au cadastre de l'IGN.

## 6.2 Le traitement

- Scripts dans `tools/data/`, **relançables** (nouvelle ville ou mise à jour annuelle).
- Ils téléchargent, nettoient et agrègent les données, puis produisent **un fichier par ville** : `data/cities/<ville>.json` (quelques dizaines de Ko), contenant :
  - les quartiers (liste des IRIS, nom, contour simplifié) ;
  - prix au m² par quartier et par type ;
  - loyers déclinés par quartier (les loyers n'existent qu'à l'échelle de la commune : on les module selon l'écart de prix entre quartiers) ;
  - volumes de ventes annuels ;
  - répartition des types de biens, des surfaces, des époques et des classes DPE ;
  - éléments de carte (rivières, axes, parcs, repères).
- Les fichiers générés sont **versionnés dans le repo** : le jeu n'a pas besoin des scripts pour fonctionner.
- La **date des données** est inscrite dans chaque fichier. La simulation part de ces valeurs à la date de création de la partie.

### Ce que fait le script (jalon 1b)

`pnpm --filter @cle/data-tools build-city dole` (voir `tools/data/README.md`) :

1. **Quartiers** : chaque quartier regroupe des IRIS (choix écrit à la main dans `tools/data/cities/dole.ts`). Les IRIS sans logement à simuler (zone industrielle) sont exclus.
2. **Ventes** : DVF de juillet 2021 à juin 2026. On garde les ventes d'**un seul logement** (maison ou appartement, dépendances comprises), pour que prix / surface ait un sens, et on écarte les valeurs aberrantes (surface de 9 à 400 m², prix de 200 à 8 000 €/m²). Chaque vente est placée dans son IRIS par le centre de sa parcelle cadastrale.
3. **Prix au m²** : médiane et quartiles par quartier et par type, **ramenés au niveau des 12 derniers mois** (rapport de la médiane récente à la médiane de la période, pour la commune). Les petits échantillons sont tirés vers la commune (10 ventes fictives au prix de la commune), d'où par exemple 1 290 €/m² pour les appartements des Mesnils Pasteur (15 ventes réelles, médiane brute d'environ 900 €/m²).
4. **Tendance** : pente annuelle du logarithme du prix au m², avec un niveau propre à chaque type de bien, tirée vers la tendance de la commune.
5. **Surfaces** : répartition par tranches, surface médiane, surface par pièce, et **élasticité** du prix au m² à la surface (les petites surfaces sont plus chères au m²).
6. **Loyers** : carte des loyers 2025 de la commune (appartements T1–T2, T3 et plus, maisons), déclinés par quartier selon l'écart de prix, avec une élasticité de 0,5.
7. **Époques et DPE** : répartition des époques de construction par quartier, et des étiquettes DPE par époque pour la commune (ADEME).
8. **Carte** : contours simplifiés (Douglas-Peucker), en mètres depuis le coin sud-ouest, avec le Doubs, les canaux, les routes principales, la voie ferrée, les parcs, la collégiale et la gare. Les équipements de la BD TOPO sont comptés par quartier.

Le fichier de Dole fait environ 50 Ko.

## 6.3 La carte de la ville

- **Formes réelles simplifiées**, dans le style illustré du jeu, comme un plan touristique dessiné à la main.
- Vrais contours des quartiers (simplifiés), Doubs, canal, grands axes, parcs, quelques **repères dessinés** (collégiale, gare).
- Coloration selon le filtre choisi.
- Le tracé est **généré par les scripts** : aucune ville n'est dessinée à la main.

## 6.4 Le contenu écrit à la main

Dans `content/`, en JSON, validé par des schémas (zod) au moment de la compilation :

- métiers ;
- banques et banquiers, agences, modèles d'artisans, rivaux, comptable ;
- postes et gammes de travaux avec leurs coûts de référence ;
- catalogue d'événements (voir [03-systemes/07-evenements.md](03-systemes/07-evenements.md)) ;
- titres, succès, défis ;
- table des modes de partie ;
- **textes à humour** : modèles d'annonces (« Charmant {type} {quartier}, idéal bricoleur courageux »), motivations des vendeurs, traits des locataires, dialogues, anecdotes. La variété vient des combinaisons.

## 6.5 La génération

- Chaque annonce est tirée au hasard **à partir des vraies répartitions** du quartier : type, surface, époque, DPE, état.
- Le **quartier** est tiré selon son volume de ventes, le **type** selon les ventes du quartier ; les immeubles de rapport, que DVF repère mal, sont rares et générés (`content/marche.json`).
- La **valeur réelle** multiplie le prix au m² médian du quartier par l'indice de prix du moment et par des facteurs (surface, époque, DPE, état, étage, défauts cachés). Ces facteurs sont **normalisés** sur les répartitions du quartier : en moyenne, la valeur générée retombe sur le prix médian observé.
- Son prix part de la valeur réelle, ajustée par la motivation du vendeur et une erreur d'estimation.
- Les locataires, artisans et événements sont générés de la même façon, à partir du contenu.
- Le hasard est **à graine** : une partie peut être rejouée exactement (tests, bots, retour en arrière).
