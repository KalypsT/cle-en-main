# 5. Direction artistique

## 5.1 Deux registres, une identité

- **Le monde** (rue, coupe) : illustré et chaleureux, en **2D vectorielle dessinée par le code** (aucune image générée par IA), animé avec PixiJS.
- **La gestion** : sobre et moderne, même fond ivoire chaud que le monde.

## 5.2 Couleurs

| Rôle | Intention |
|---|---|
| Fond | Ivoire chaud |
| Accent, biens du joueur | Vert sarcelle (réglable) |
| Alerte | Ambre |
| Négatif | Rouge brique |
| Positif | Vert |

Les couleurs ne portent jamais l'information seules : toujours une icône ou un texte.

**Valeurs retenues au jalon 4** (thème clair, jetons CSS de `apps/game/src/styles.css`) :

| Rôle | Couleur | Teinte claire (fonds) |
|---|---|---|
| Fond ivoire | `#f6f1e6` (surfaces `#fffdf8`, bordures `#e3d9c6`) | — |
| Texte | `#24262b` (secondaire `#6e6658`) | — |
| Sarcelle (accent, biens du joueur) | `#0f6f68` | `#dcefeb` |
| Ambre (alerte) | `#a35a06` | `#fcefd3` |
| Brique (négatif) | `#b23d27` | `#f8e0d9` |
| Vert (positif) | `#2e7a3a` | `#e1f0dd` |

Le thème sombre arrive au jalon 5. Les classes énergie gardent les couleurs habituelles de l'étiquette DPE (vert foncé à rouge).

## 5.3 Les façades, générées par modules

Le code assemble étages, fenêtres, toits, volets, portes, balcons et commerces en rez-de-chaussée selon l'**époque** du bien et la **ville** :

| Ville | Matériaux et motifs |
|---|---|
| **Dole** | Pierre calcaire dorée, volets de couleurs douces, maisons anciennes au bord du canal |
| **Dijon** | Maisons à pans de bois, toits en tuiles vernissées colorées |
| **Besançon** | Pierre de Chailluz bleu-gris et ocre, centre ancien |
| **Chalon-sur-Saône** | Quais, maisons de ville, ensembles des années 1960 |
| **Partout** | Petits immeubles d'après-guerre, résidences des années 1970, pavillons |

Les biens du joueur sont marqués de sa couleur d'accent. Les états visibles : panneau « À vendre », échafaudage, bâche, fenêtres neuves après travaux.

## 5.4 Lumière, météo et saisons

- **Quatre moments** : matin, jour, soir, nuit, avec les fenêtres et les lampadaires qui s'allument.
- **Météo** : soleil, nuages, pluie, neige, brouillard sur la Saône et le Doubs.
- **Saisons** : fleurs au printemps, terrasses en été, feuilles en automne, neige et décorations de Noël en hiver.

## 5.5 Les personnages

- **Passants et locataires** : un peu plus détaillés que de simples silhouettes, sans complexité excessive :
  - visages simples (yeux, sourcils, bouche, coiffure), tête légèrement agrandie pour rester lisible ;
  - vêtements en 2 ou 3 couleurs, selon la saison ;
  - accessoires contextuels : parapluie sous la pluie, poussette, chien en laisse, vélo, sac de courses, baguette sous le bras ;
  - marche animée par le code (balancement des bras et des jambes).
- **Personnages nommés** (banquiers, comptable, rivaux, artisans, agences) : **portraits en buste** avec trois expressions (neutre, content, contrarié), dans les dialogues et les notifications.
- **Avatar du joueur** : composé (visage, coiffure, teint, tenue). Au jalon 4, une version simple en SVG : 4 visages, 6 coiffures, 6 teints, 5 tenues ; Gérard et Yvon ont un portrait du même style.

## 5.6 Les animations

Passants, voitures, oiseaux, fumée des cheminées, échafaudages et poussière de chantier, camion de l'artisan qui se gare, panneau « À vendre » qui apparaît, fenêtres qui s'allument, et une **scène de célébration** à chaque nouveau titre.

L'animation doit rester fluide sur un téléphone de milieu de gamme (voir [08-equilibrage.md](08-equilibrage.md) et [09-feuille-de-route.md](09-feuille-de-route.md)).

## 5.7 Typographie

- **Manrope** pour l'interface (lisible, chiffres alignés).
- **Une police expressive** pour le titre *Clé en main !* et les grands moments (bilans, titres) : **Fraunces**, retenue au jalon 4 et embarquée comme Manrope (hors ligne).

## 5.8 Le son

- **Ambiances** par moment et par lieu : oiseaux le matin, rumeur de la ville, **cloches à midi**, pluie, chantier.
- **Effets d'interface** discrets : « ka-ching » pour les loyers, tampon du notaire, perceuse.
- **Musique** fournie par Thibaud :
  - boucles de 1 min 30 à 3 min, en MP3 ou OGG, sous licence libre ou créées par lui ;
  - **4 emplacements** : matin et journée, soirée, nuit, bilans et célébrations (chaque emplacement peut accueillir plusieurs morceaux) ;
  - le jeu fonctionne sans musique tant qu'elle n'est pas fournie.
- **Trois volumes séparés** : musique, ambiances, effets.

## 5.9 Les maquettes

Les maquettes existantes (voir [maquettes/](maquettes/README.md)) donnent une première intention. Le graphisme est à **améliorer** pendant la réalisation.
