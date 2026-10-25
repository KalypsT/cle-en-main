# 3.3 Marché et annonces

## Les quartiers

Chaque ville est découpée en **quartiers réels** (5 pour Dole : Centre historique, Les Mesnils Pasteur, Les Paters, Plumont – Val Fleuri, Azans ; 6 à 8 pour les grandes villes), chacun avec :

- un **prix au m²** par type de bien (appartement, maison) ;
- un **loyer au m²** ;
- une **demande locative** et un taux de **vacance** ;
- une **attractivité** (commerces, transports, écoles) ;
- une **tendance** (hausse, stabilité, baisse) ;
- un **plafond de valeur** : au-delà, les travaux haut de gamme rapportent peu ;
- une répartition des types de biens, des époques de construction et des classes DPE (issues des données réelles, voir [06-donnees.md](../06-donnees.md)).

## Les biens

Types disponibles dès le départ : **appartements** (studio à T5), **maisons**, **immeubles de rapport**.
Au jalon 8 : locaux commerciaux, parkings, terrains à bâtir.

> **Jalon 8, les nouveaux types de biens** (`content/marche.json`, `otherKinds` ; décision validée : des ratios écrits à la main, les données DVF les repérant mal) :
>
> | Type | Part du flux d'annonces | Surface | Prix au m² | Loyer au m² |
> |---|---|---|---|---|
> | Local commercial | 3 % | 30 à 150 m² | 75 % du prix médian des appartements du quartier | 95 % du loyer des grands appartements |
> | Parking | 4 % | 12 à 15 m² | 45 % | 50 % |
> | Terrain à bâtir | 2 % | 300 à 900 m² | 5 % au moins (voir plus bas) | ne se loue pas |
>
> - Ni pièces, ni postes, ni travaux ordinaires ; les règles de décence et du DPE des logements ne s'appliquent pas. Taxe foncière, charges et assurance propriétaire ont leurs propres valeurs (assurance ×1,5 pour un local, ×0,2 pour un parking).
> - Rendement brut : environ 8 % pour un local, 7 % pour un parking, contre 7 % pour un appartement à Dole.
> - **Compte à rebours** : un terrain vaut le plus grand de son prix plancher et de **75 % de la marge** de la maison qu'on peut y construire (valeur d'une maison neuve du quartier moins le coût de construction et du maître d'œuvre). De même, une maison qui a des **combles aménageables** (35 % des maisons, 20 à 40 % de leur surface) vaut 75 % de la marge de leur aménagement en plus. Sans cela, construire ou aménager était de l'argent gratuit dans les villes chères (le modèle valorise un bien neuf environ 1,6 fois la médiane du quartier).
> - Un titre « Bailleur » ne compte que les logements loués : un parking ne fait pas un bailleur.

Chaque bien a :
- un type, une surface, un étage, un nombre de pièces ;
- une **époque** de construction (qui détermine le style de façade et les risques de chantier) ;
- un **état par pièce et par poste**, en partie caché (voir [05-travaux-et-copropriete.md](05-travaux-et-copropriete.md)) ;
- un **DPE** ;
- des charges de copropriété et une taxe foncière ;
- une **valeur réelle** calculée par le moteur (quartier, surface, état, DPE, étage, époque).

> **Jalon 1b (en attendant les pièces et postes du jalon 3)** : l'état est **global**, sur 5 niveaux (à rénover entièrement, travaux à prévoir, à rafraîchir, bon état, rénové), plus des **défauts cachés** (humidité, toiture, électricité, plomberie, chauffage, fissures, mérule, voisins bruyants) qui retirent chacun une part de la valeur. La valeur réelle les compte tous ; l'**estimation** affichée au joueur ne compte que ceux qu'il connaît, et les autres selon leur probabilité. Le diagnostic par un artisan arrive au jalon 3. La taxe foncière et les charges de copropriété sont calculées et stockées sur le bien, mais prélevées à partir du jalon 2.
>
> **Jalon 3** : l'état global et les défauts cachés sont remplacés par les **pièces et postes** du chapitre [05-travaux-et-copropriete.md](05-travaux-et-copropriete.md) (état de 1 à 5 par poste, en partie caché). L'annonce garde un des 5 états globaux, calculé depuis les postes ; la visite montre les pièces et seulement parfois les éléments techniques ; le **diagnostic par un artisan** (180 €, sans temps libre) révèle les postes de son métier. Seul défaut caché restant : les voisins bruyants. Les frères Martinot remettent en vente des biens dont ils ont refait tous les postes visibles en gamme Éco, et les postes cachés une fois sur deux (« du travail de pro, ou presque »).

## La vie d'une annonce

1. **Apparition** : le flux d'annonces de chaque ville est calé sur son **volume réel de ventes** (données DVF). Une petite ville comme Dole en génère peu (environ une par jour, une soixantaine en ligne).
2. **Prix affiché** = valeur réelle × motivation du vendeur × erreur de prix. Les bonnes affaires viennent des vendeurs pressés et des erreurs d'estimation.
3. **Durée de vie** : une bonne affaire part vite (souvent achetée par un rival), une annonce trop chère traîne puis baisse de prix. Au jalon 1b, l'acheteur concurrent est anonyme (« vendu à un autre acheteur ») ; les rivaux nommés arrivent au jalon 1c. La chance quotidienne qu'un autre acheteur emporte l'annonce croît de façon exponentielle avec l'écart entre la valeur et le prix.
4. **Visite** (1 h + trajet) : révèle une partie des défauts cachés. Option **diagnostic par un artisan** (payant, sans temps libre) qui révèle l'état d'un corps de métier.
5. **Offre** : le joueur propose un prix. Le vendeur **accepte, refuse ou fait une contre-offre** (une seule étape de négociation). Sa décision dépend de sa motivation, du temps passé en ligne et de la concurrence. Les motivations sont décrites avec humour (« mutation », « succession », « veut partir élever des alpagas »).
   - Le vendeur répond le lendemain. Il accepte au-dessus de son **prix plancher** : prix affiché moins une remise qui dépend de sa motivation, augmente avec les mois en ligne et diminue si l'annonce est une bonne affaire (d'autres acheteurs sont intéressés).
   - Une offre un peu sous le plancher reçoit une **contre-offre**, valable 3 jours, que le joueur accepte ou refuse. Deux offres au plus par annonce. Chaque réponse du vendeur (acceptation, **refus**, contre-offre laissée expirer ou déclinée) est gardée comme **lettre** dans le Courrier des Décisions ([04-interface.md](../04-interface.md#410-rythme-et-progression-jalon-6)) : notification à l'écran pour un refus, encadré « Dernière réponse du vendeur » sur l'annonce, badge dans la liste. La lettre reste après le départ de l'annonce, jusqu'à ce que le joueur la ferme ou pendant 12 mois. Le vendeur ne donne pas de raison.
   - Le commercial obtient une remise supplémentaire ; l'agent immobilier voit une partie des annonces un jour avant les autres acheteurs.
6. **Compromis** : délai d'environ **2 semaines de jeu** pour obtenir le prêt (condition suspensive). Sans prêt, la vente est annulée sans pénalité.
   - Un **dépôt de garantie** de 5 % est versé à la signature ; il est rendu si le prêt n'est pas obtenu, déduit du prix à l'acte.
   - Le joueur demande un prêt à une ou plusieurs banques (montant, durée). Chaque banque répond après son délai ; le joueur choisit une offre. Il peut aussi renoncer à la condition de prêt et payer comptant.
   - Se retirer est gratuit pendant la condition de prêt, tant qu'aucun prêt n'est choisi.
   - **Corrections du 25 octobre 2026** : une banque dont la réponse arriverait après la fin de la condition de prêt refuse la demande (`purchase.answerTooLate`) ; avant, l'achat était annulé avant sa réponse.
7. **Acte** : signature chez le notaire environ **30 jours** après le compromis. Les frais de notaire sont payés, le bien appartient au joueur.
   - Le joueur paie le prix, les frais de notaire et (avec un prêt) les frais de dossier et de garantie, moins le dépôt et le prêt. S'il n'a pas assez sur son compte, la vente est annulée et **le dépôt est perdu**.
   - Les défauts encore cachés se découvrent en prenant possession du bien.

> **Plaisir de jeu, lot 3 : le verdict** (2026-10-22, point ouvert n° 17). Chaque annonce porte un verdict tiré de l'**estimation du joueur** (celle de la fiche : ce que visites et diagnostics ont appris, les défauts encore cachés comptés selon leur probabilité ; le verdict ne trahit donc jamais un défaut caché) : **Bonne affaire** quand le prix affiché est au moins **8 %** sous l'estimation, **Trop cher** quand il est au moins **8 %** au-dessus, **Au prix** entre les deux (`verdict` de `content/marche.json`, requête `dealVerdict`). Le badge **Se paie tout seul** s'affiche quand le cash-flow prévu est vert (+30 € par mois ou plus, chapitre 4.5). Avant la visite, l'estimation est plus floue : le verdict peut changer après elle. Le succès « Flair de fouine » garde son propre seuil (10 % sous l'estimation à l'achat).

## Les opportunités particulières

- **Enchères judiciaires** : rares, annoncées quelques jours avant, sans visite ni condition de prêt. Enchère en direct avec les rivaux. Risque élevé, décote possible.
- **Biens hors marché** : proposés directement par les agents quand la réputation (ou la notoriété locale) est élevée, avant toute publication.
- **Avance de l'agent immobilier** : si c'est le métier du joueur, il voit certaines annonces 24 à 48 h avant tout le monde.

## L'évolution du marché

- **Tendance de fond par quartier**, avec du bruit. Elle part de la tendance observée dans DVF et revient lentement vers une tendance de long terme (moitié la tendance observée, moitié 1,5 % par an).
- **Cycles nationaux** liés au taux de marché (les prix réagissent avec retard aux taux) : environ −5 % de prix par point de hausse du taux, lissé sur une dizaine de mois.
- Les prix du fichier de ville sont ceux de sa date de données ; à la création de la partie, ils sont projetés jusqu'à la date du jour avec la tendance observée.
- **Événements locaux** : arrivée d'un tramway, fermeture d'usine, rénovation urbaine, nouvelle école (voir [07-evenements.md](07-evenements.md)).
- **Chocs rares** : crise nationale (une fois tous les 5 à 10 ans de jeu).

## La revente

- Le joueur fixe son prix (le jeu affiche une estimation et une fourchette).
- Le **délai de vente** dépend de l'écart avec la valeur réelle, de l'état, du DPE et du marché.
- Deux modes :
  - **par une agence** : frais (environ 5 % du prix), aucun temps libre ;
  - **soi-même** : pas de frais, mais des visites qui coûtent du temps libre.
- Les offres reçues arrivent dans les décisions (accepter, refuser, contre-proposer). Les rivaux peuvent faire une offre.
  - Les visites sont plus rares quand le prix dépasse la valeur ; une agence en apporte davantage. Une offre reste valable 3 jours ; une contre-proposition est acceptée si elle reste dans la marge cachée de l'acheteur.
  - L'acte est signé environ 60 jours après l'accord ; l'acheteur peut se désister (refus de son prêt), et le bien revient en vente.
- À la vente : remboursement du crédit et calcul de la plus-value (voir [06-fiscalite.md](06-fiscalite.md)).
  - Le crédit lié au bien est remboursé sur le prix, avec les mêmes frais qu'un remboursement anticipé (chapitre 3.2). La plus-value est imposée à partir du jalon 2.
  - **Corrections du 25 octobre 2026** : ces frais sont bien les indemnités de remboursement anticipé (le plus petit de 3 % et de 6 mois d'intérêts), vente forcée comprise ; la vente appliquait par erreur les frais de renégociation (3 % et 1 000 €).

## Les investisseurs rivaux

Trois rivaux nommés, chacun avec une stratégie, un budget, des villes préférées et une personnalité.

| Rival | Stratégie | Personnalité |
|---|---|---|
| **Monique Delaporte** | Petites surfaces près des gares, très rapide sur les bonnes affaires | Retraitée redoutable, polie et implacable |
| **Les frères Martinot** | Marchands de biens : achètent pour rénover et revendre, font grimper les enchères | Bruyants, toujours deux à parler en même temps |
| **SCI Horizon Patrimoine** | Arrive plus tard dans la partie, achète des immeubles entiers à Dijon et Besançon | Fonds impersonnel : « nous reviendrons vers vous » |

- Les rivaux **agissent sur le même marché** que le joueur : on voit « Vendu à Mme Delaporte » sur une annonce ratée.
- Ils peuvent faire une **offre sur un bien que le joueur revend**.
- Ils proposent parfois une **affaire**, pas toujours honnête.
- Leur agressivité dépend du mode de partie et augmente quand le joueur grandit.
- Ils restent peu nombreux (3) et lisibles : pas de simulation économique complète de leur patrimoine, seulement un budget, des préférences et des règles de décision.

### Les rivaux au jalon 1c

Contenu dans `content/rivaux.json`, système `packages/engine/src/systems/rivals.ts`.

- **Chaque jour, avant les autres acheteurs**, chaque rival actif parcourt les annonces publiques (pas celles sur lesquelles le joueur a une offre en cours). Il juge la valeur avec sa propre erreur d'estimation, **fixe pour un bien donné** : attendre ne lui donne pas une nouvelle chance de se tromper. Il achète au prix affiché si l'écart dépasse son seuil, avec une probabilité quotidienne (sa vivacité × son intérêt pour le quartier × l'agressivité), et si son budget le permet. L'annonce affiche alors « Vendu à Mme Delaporte ».
- **Budget** : un capital de départ, un revenu mensuel et un plafond. Un achat coûte le prix plus 7,5 % de frais. C'est toute la « comptabilité » d'un rival.
- **Monique Delaporte** : appartements de 50 m² au plus, en bon état ou à rafraîchir, au Centre historique (la gare de Dole-Ville y est) et, un peu moins, aux Paters ; seuil de 4 %, très vive.
- **Les frères Martinot** : tout bien en ruine ou à rénover, dans toute la ville, sous un seuil de 8 %. Ils le « rénovent » pendant 4 à 9 mois, puis le remettent en vente, rénové et sans défaut, comme une nouvelle annonce (motivation « Rénové par les frères Martinot »). Leur budget récupère le prix affiché (la revente n'est pas simulée). Les enchères, où ils font grimper les prix, arriveront avec les enchères judiciaires.
- **SCI Horizon Patrimoine** : décrite, mais inactive jusqu'au jalon 8.

> **Jalon 8, l'arrivée de la SCI Horizon** (décision validée ; `content/rivaux.json`, champ `arrival`) : elle entre sur le marché au plus tôt la **8e année de jeu**, une fois que le patrimoine net du joueur dépasse **400 000 €** (vérifié chaque mois ; un événement et une ligne de chronique l'annoncent). Elle cherche à Dijon, Besançon et Dole des **immeubles et des locaux commerciaux**, en bon état ou à rafraîchir, avec un seuil de bonne affaire de 3 %, une vivacité moyenne (0,3) et un budget de 2 M€ (plus 100 000 € par mois, 5 M€ au plus). Elle fait aussi des offres, de 95 à 100 % du prix, sur les immeubles que le joueur met en vente. Son agressivité suit la règle commune (+0,1 par 100 000 € de patrimoine du joueur, plafonnée à 1,6).
- **Offres sur les biens du joueur** : un rival qui voit dans un bien en vente une bonne affaire (selon ses préférences et son seuil) fait une offre de 90 à 100 % du prix demandé, valable 3 jours. Il accepte une contre-proposition tant que le prix reste une bonne affaire à ses yeux. Il paie comptant : il ne se désiste pas avant l'acte. Les Martinot rénovent et remettent en vente ce qu'ils achètent au joueur.
- **Agressivité** : 1 au départ, +0,1 par tranche de 100 000 € de patrimoine net du joueur, plafonnée à 1,6. Le coefficient du mode de partie arrivera avec les modes (jalon 6), comme les « affaires pas toujours honnêtes » (événements).
- Les **acheteurs anonymes** (ménages) restent : ils emportent les annonces au prix du marché, les rivaux les bonnes affaires.

