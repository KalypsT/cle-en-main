# 6. Données

Principe : **de vraies données publiques**, traitées par des scripts, livrées au jeu sous forme de **petits fichiers JSON**. Aucun serveur.

## 6.1 Les sources réelles (ouvertes)

| Source | Usage dans le jeu |
|---|---|
| **DVF** (Demandes de valeurs foncières, data.gouv.fr) | Prix de vente réels, volumes de ventes par commune et par type de bien : calage des prix au m² et du flux d'annonces |
| **Carte des loyers** publiée par l'État | Loyers par commune et par type de logement |
| **INSEE** | Population, part d'étudiants, découpage infracommunal (IRIS) : base des quartiers et de leurs contours |
| **Base DPE de l'ADEME** | Répartition réelle des classes énergétiques selon la commune et l'époque de construction |
| **OpenStreetMap** | Rivières, canaux, grands axes, parcs, repères pour la carte de la ville (licence ODbL : mentionner la source dans le jeu) |

Limite connue : DVF ne couvre pas l'Alsace et la Moselle.

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
- Son prix part de la valeur réelle, ajustée par la motivation du vendeur et une erreur d'estimation.
- Les locataires, artisans et événements sont générés de la même façon, à partir du contenu.
- Le hasard est **à graine** : une partie peut être rejouée exactement (tests, bots, retour en arrière).
