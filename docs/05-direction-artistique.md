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

Les couleurs ne portent jamais l'information seules : toujours une icône ou un texte. Valeurs exactes définies au jalon 4.

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

**Réalisation (jalon 5)** : avant 1948, pierre calcaire dorée, chaînes d'angle, corniche, hautes fenêtres à volets doux, toits de tuiles à deux pans ou à la Mansart avec lucarnes ; 1948-1974, enduit clair, fenêtres carrées et volets roulants ; 1975-1988, résidences à balcons filants et toits plats ; 1989-2005, enduits pastel et toits à quatre pans ; après 2005, blanc et bardage, grandes baies, panneaux solaires sur certains pavillons. Les commerces ont un store et une enseigne (noms dans `content/textes/ecrans.json`). L'usure de la façade (taches, fissure) suit l'état des postes visibles du bien (façade, fenêtres, toiture, parties communes). Le centre historique de Dole montre le clocher de la Collégiale en silhouette, et une rue longe le canal des Tanneurs.

## 5.4 Lumière, météo et saisons

- **Quatre moments** : matin, jour, soir, nuit, avec les fenêtres et les lampadaires qui s'allument.
- **Météo** : soleil, nuages, pluie, neige, brouillard sur la Saône et le Doubs.
- **Saisons** : fleurs au printemps, terrasses en été, feuilles en automne, neige et décorations de Noël en hiver.
- **Réalisation (jalon 5)** : heures des moments, dates des saisons et de Noël, probabilités de la météo par saison et durée d'un temps (1 à 3 jours) dans `content/monde.json`. La météo est calculée par le moteur, sans rien stocker ; le brouillard ne reste que sur les quais, hors du milieu de la journée. Les fenêtres s'allument selon l'heure (réveil, retour du travail, coucher), les lampadaires à partir du soir.

## 5.5 Les personnages

- **Passants et locataires** : un peu plus détaillés que de simples silhouettes, sans complexité excessive :
  - visages simples (yeux, sourcils, bouche, coiffure), tête légèrement agrandie pour rester lisible ;
  - vêtements en 2 ou 3 couleurs, selon la saison ;
  - accessoires contextuels : parapluie sous la pluie, poussette, chien en laisse, vélo, sac de courses, baguette sous le bras ;
  - marche animée par le code (balancement des bras et des jambes).
- **Personnages nommés** (banquiers, comptable, rivaux, artisans, agences) : **portraits en buste** avec trois expressions (neutre, content, contrarié), dans les dialogues et les notifications.
- **Avatar du joueur** : composé de six choix : visage (4), coiffure (11), couleur de cheveux (8), teint (6), tenue (8) et accessoire (7 : aucun, lunettes rondes ou carrées, barbe, barbe et lunettes, boucles d'oreilles, boucles et lunettes). Les cheveux sont dessinés en deux couches (derrière la tête pour le volume, la longueur, le chignon ; devant, découpée sur le visage, pour la frange), si bien que chaque coiffure suit chaque forme de visage. La sauvegarde garde quatre indices : la coiffure et la couleur partagent `hair`, la tenue et l'accessoire partagent `outfit`.

## 5.6 Les animations

Passants, voitures, oiseaux, fumée des cheminées, échafaudages et poussière de chantier, camion de l'artisan qui se gare, panneau « À vendre » qui apparaît, fenêtres qui s'allument, et une **scène de célébration** à chaque nouveau titre.

L'animation doit rester fluide sur un téléphone de milieu de gamme (voir [08-equilibrage.md](08-equilibrage.md) et [09-feuille-de-route.md](09-feuille-de-route.md)).

## 5.7 Typographie

- **Manrope** pour l'interface (lisible, chiffres alignés).
- **Une police expressive** pour le titre *Clé en main !* et les grands moments (bilans, titres), par exemple **Fraunces**.

## 5.8 Le son

- **Ambiances** par moment et par lieu : oiseaux le matin, rumeur de la ville, **cloches à midi**, pluie, chantier.
- **Effets d'interface** discrets : « ka-ching » pour les loyers, tampon du notaire, perceuse.
- **Musique** fournie par Thibaud :
  - boucles de 1 min 30 à 3 min, en MP3 ou OGG, sous licence libre ou créées par lui ;
  - **4 emplacements** : matin et journée, soirée, nuit, bilans et célébrations (chaque emplacement peut accueillir plusieurs morceaux) ;
  - le jeu fonctionne sans musique tant qu'elle n'est pas fournie.
- **Trois volumes séparés** : musique, ambiances, effets.
- **Réalisation (jalon 5)** : ambiances et effets **synthétisés par le code** (Web Audio) : rumeur de la ville selon le moment, pluie, clapotis des quais, oiseaux le matin, grillons les nuits d'été, marteau et perceuse près d'un chantier, cloches à midi (trois coups), « ka-ching » quand des loyers arrivent au bilan du mois, tampon à la signature d'un compromis, d'un acte ou d'une vente, perceuse au lancement d'un chantier. Le son démarre au premier toucher (règle des navigateurs).
- **Ajouter la musique** : déposer les fichiers MP3 ou OGG dans `apps/game/public/musique/<emplacement>/` (`day` pour le matin et la journée, `evening`, `night`, `celebration`) et inscrire leurs noms dans `content/musique.json`. Ils sont mis en cache pour le hors-ligne (12 Mo au plus par fichier). L'emplacement des célébrations joue pendant que le bilan mensuel, le bilan annuel ou la célébration d'un nouveau titre est ouvert (jalon 6).

## 5.9 Les maquettes

Les maquettes existantes (voir [maquettes/](maquettes/README.md)) donnent une première intention. Le graphisme est à **améliorer** pendant la réalisation.
