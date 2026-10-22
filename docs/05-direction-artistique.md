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
- **Lumière (retours de jeu du 22 octobre 2026)** : ciel en trois teintes (haut, milieu au-dessus des toits, horizon : pêche à l'aube, mauve et orange au couchant) et halo du soleil, plus large et plus chaud quand il est bas ; les nuages prennent la couleur du soleil bas par beau temps ; étoiles qui scintillent. Fenêtres allumées ambrées, plus claires en haut (le plafonnier), avec un léger halo ; certaines ont des rideaux retenus, quelqu'un à la maison, ou la lueur bleue d'une télévision après 19 h. Vitrines garnies d'étagères et de marchandises, éclairées de 7 h à 20 h (leur lumière déborde sur le trottoir), veilleuse ensuite. Flaque de lumière sous chaque lampadaire, ampoule brillante, reflets des lampadaires sur la chaussée mouillée quand il pleut. Feux arrière rouges des voitures, au soir et au freinage. Fenêtres allumées dans la ville au loin, la nuit. Passants et voitures un peu plus clairs que les façades, pour rester lisibles la nuit.
- **Profondeur (retours de jeu du 22 octobre 2026)** : deux plans de ville derrière la rue, le plus proche avec des toits variés et des cheminées, le plus lointain (toits et bouquets d'arbres) dans la couleur du ciel, défilant plus lentement ; une brume couleur d'horizon à leur pied. Nuages en boules à la base ombrée, opaques et fondus dans le ciel par leur couleur, sur deux plans (les lointains plus petits et plus lents) : trois par beau temps, huit sinon. Ombre douce sous les passants et les voitures, ombre des façades sur le trottoir, bordure éclairée, caniveau et plaques d'égout. Le monument du centre ancien (la Collégiale à Dole…) se dresse derrière le début de la première rue : placé trop loin, il n'apparaissait jamais. En qualité « Économie », le plan lointain et la brume disparaissent et le ciel garde au plus trois nuages.
- **Passants (retours de jeu du 22 octobre 2026)** : adultes, enfants, personnes âgées (cheveux gris, pas lents, souvent une canne, parfois un béret), adolescents (capuche, téléphone), joggeurs par beau temps (tenue de sport, foulées amples) ; chapeaux, casquettes, chignons et queues de cheval ; parfois deux personnes qui marchent ensemble, au même pas. Six passants sur dix s'arrêtent de temps en temps 2 à 6 secondes (jamais les cyclistes, les joggeurs ni les couples) ; le chien remue la queue.
- **Ambiance figée en vitesse rapide** : à ×4 et au-delà (accélération automatique comprise ; `stillAmbienceSpeed` dans `content/temps.json`), une journée dure 5 secondes ou moins et le jour, la nuit, la pluie et la musique défileraient en clignotant. La rue, le thème « Automatique » et la musique gardent alors le moment, l'heure des fenêtres et la météo de chaque rue qu'ils avaient quand le temps s'est accéléré ; ils rejoignent l'heure du jeu, en douceur, dès que le temps ralentit (pause comprise). Les cloches ne sonnent pas pendant ce temps.

## 5.5 Les personnages

- **Passants et locataires** : un peu plus détaillés que de simples silhouettes, sans complexité excessive :
  - visages simples (yeux, sourcils, bouche, coiffure), tête légèrement agrandie pour rester lisible ;
  - vêtements en 2 ou 3 couleurs, selon la saison ;
  - accessoires contextuels : parapluie sous la pluie, poussette, chien en laisse, vélo, sac de courses, baguette sous le bras ;
  - marche animée par le code (balancement des bras et des jambes).
- **Personnages nommés** (banquiers, comptable, rivaux, artisans, agences) : **portraits en buste** avec trois expressions (neutre, content, contrarié), dans les dialogues et les notifications.
- **Avatar du joueur** : composé de six choix : visage (4), coiffure (11), couleur de cheveux (8), teint (6), tenue (8) et accessoire (7 : aucun, lunettes rondes ou carrées, barbe, barbe et lunettes, boucles d'oreilles, boucles et lunettes). Les cheveux sont dessinés en deux couches (derrière la tête pour le volume, la longueur, le chignon ; devant, découpée sur le visage, pour la frange), si bien que chaque coiffure suit chaque forme de visage. La sauvegarde garde quatre indices : la coiffure et la couleur partagent `hair`, la tenue et l'accessoire partagent `outfit`.

## 5.6 Les animations

Passants (certains s'arrêtent quelques secondes ; jamais les cyclistes), voitures (une voie par sens, distance gardée entre elles), oiseaux, fumée des cheminées, échafaudages et poussière de chantier, camion de l'artisan qui se gare, panneau « À vendre » qui apparaît, fenêtres qui s'allument, et une **scène de célébration** à chaque nouveau titre.

**Réalisation (retours de jeu du 22 octobre 2026)** :
- **Foule de la rue** : la vue compte un nombre de passants, de voitures et d'oiseaux qui dépend du moment et de la saison (soirs d'été animés, nuits d'hiver vides), de la météo, de la rue (les commerces attirent du monde, les pavillons moins, les quais n'ont pas de voitures et attirent les promeneurs au soleil), de la largeur de la vue (le panorama en montre plus) et de la qualité graphique. Qui sort de la vue disparaît ; un nouveau venu, habillé pour le moment et la météo du moment, entre par un côté (celui vers lequel on fait glisser la rue, si on la fait glisser) tant que la vue n'est pas pleine. Les oiseaux traversent le ciel par petits groupes.
- **Voitures** : une voie par sens ; chacune ralentit derrière une plus lente et garde ses distances ; une voiture n'entre que si sa voie est libre.
- **Lumières** : de l'arrière vers l'avant, les façades, les fenêtres et vitrines allumées, ce qui se tient devant les façades (volets, croisillons, balcons, arbres, lampadaires, enseignes, ouvriers), puis les passants et les voitures, et enfin le halo des lampadaires et les guirlandes.

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
