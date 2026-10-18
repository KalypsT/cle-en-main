# 3.3 Marché et annonces

## Les quartiers

Chaque ville est découpée en **quartiers réels** (environ 4 pour Dole, 6 à 8 pour les grandes villes), chacun avec :

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

Chaque bien a :
- un type, une surface, un étage, un nombre de pièces ;
- une **époque** de construction (qui détermine le style de façade et les risques de chantier) ;
- un **état par pièce et par poste**, en partie caché (voir [05-travaux-et-copropriete.md](05-travaux-et-copropriete.md)) ;
- un **DPE** ;
- des charges de copropriété et une taxe foncière ;
- une **valeur réelle** calculée par le moteur (quartier, surface, état, DPE, étage, époque).

## La vie d'une annonce

1. **Apparition** : le flux d'annonces de chaque ville est calé sur son **volume réel de ventes** (données DVF). Une petite ville comme Dole en génère peu.
2. **Prix affiché** = valeur réelle × motivation du vendeur × erreur de prix. Les bonnes affaires viennent des vendeurs pressés et des erreurs d'estimation.
3. **Durée de vie** : une bonne affaire part vite (souvent achetée par un rival), une annonce trop chère traîne puis baisse de prix.
4. **Visite** (1 h + trajet) : révèle une partie des défauts cachés. Option **diagnostic par un artisan** (payant, sans temps libre) qui révèle l'état d'un corps de métier.
5. **Offre** : le joueur propose un prix. Le vendeur **accepte, refuse ou fait une contre-offre** (une seule étape de négociation). Sa décision dépend de sa motivation, du temps passé en ligne et de la concurrence. Les motivations sont décrites avec humour (« mutation », « succession », « veut partir élever des alpagas »).
6. **Compromis** : délai d'environ **2 semaines de jeu** pour obtenir le prêt (condition suspensive). Sans prêt, la vente est annulée sans pénalité.
7. **Acte** : signature chez le notaire environ **30 jours** après le compromis. Les frais de notaire sont payés, le bien appartient au joueur.

## Les opportunités particulières

- **Enchères judiciaires** : rares, annoncées quelques jours avant, sans visite ni condition de prêt. Enchère en direct avec les rivaux. Risque élevé, décote possible.
- **Biens hors marché** : proposés directement par les agents quand la réputation (ou la notoriété locale) est élevée, avant toute publication.
- **Avance de l'agent immobilier** : si c'est le métier du joueur, il voit certaines annonces 24 à 48 h avant tout le monde.

## L'évolution du marché

- **Tendance de fond par quartier**, avec du bruit.
- **Cycles nationaux** liés au taux de marché (les prix réagissent avec retard aux taux).
- **Événements locaux** : arrivée d'un tramway, fermeture d'usine, rénovation urbaine, nouvelle école (voir [07-evenements.md](07-evenements.md)).
- **Chocs rares** : crise nationale (une fois tous les 5 à 10 ans de jeu).

## La revente

- Le joueur fixe son prix (le jeu affiche une estimation et une fourchette).
- Le **délai de vente** dépend de l'écart avec la valeur réelle, de l'état, du DPE et du marché.
- Deux modes :
  - **par une agence** : frais (environ 5 % du prix), aucun temps libre ;
  - **soi-même** : pas de frais, mais des visites qui coûtent du temps libre.
- Les offres reçues arrivent dans les décisions (accepter, refuser, contre-proposer). Les rivaux peuvent faire une offre.
- À la vente : remboursement du crédit et calcul de la plus-value (voir [06-fiscalite.md](06-fiscalite.md)).

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
