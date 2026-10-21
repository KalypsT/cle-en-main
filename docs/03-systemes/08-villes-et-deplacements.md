# 3.8 Villes et déplacements

## Les villes

**Départ fixe à Dole** pour tout le monde, ville d'apprentissage. Dans le jeu, **rien n'est verrouillé** : toutes les villes intégrées sont accessibles dès le début, la distance fait le tri.

| Ville | Trajet depuis Dole (indicatif) | Profil de marché | Décor de la rue |
|---|---|---|---|
| **Dole** | — | Petite ville, prix bas (environ 1 700 €/m² pour un appartement, 2 050 €/m² pour une maison en 2026), peu d'annonces : le marché se sature vite | Clocher de la collégiale, canal des Tanneurs |
| **Dijon** | environ 45 min | Capitale régionale, plus chère (environ 2 750 €/m², loyer environ 13,8 €/m²), forte demande, étudiants | Tour Philippe le Bon, toits en tuiles vernissées |
| **Besançon** | environ 50 min | Ville étudiante, centre ancien, relief, chantiers valorisants (prix à confirmer, autour de 2 200 €/m²) | Citadelle, boucle du Doubs |
| **Chalon-sur-Saône** | environ 1 h | Ville industrielle, très abordable, rendement élevé, plus de vacance (prix à confirmer, autour de 1 600 €/m²) | Quais de Saône, tour du Doyenné |

Les prix réels seront produits par les scripts de données (voir [06-donnees.md](../06-donnees.md)).

### Ordre d'intégration dans le développement

1. **Dole** : première tranche jouable (jalon 4).
2. **Dijon, Chalon-sur-Saône, Besançon** : jalon 7.
3. **D'autres villes de France** : à choisir au jalon 9 (voir [10-points-ouverts.md](../10-points-ouverts.md)).
4. **Paris en mode défi** : presque inaccessible au départ, objectif de fin de partie.

> Attention : la base DVF ne couvre pas l'Alsace et la Moselle (Strasbourg, Mulhouse, Metz). Ces villes demanderaient une autre source de prix.

## Les quartiers

- De **vrais quartiers** : environ **4 pour Dole**, **6 à 8 pour les grandes villes**.
- Chaque quartier a ses caractéristiques (voir [03-marche-et-annonces.md](03-marche-et-annonces.md#les-quartiers)).
- **Une rue vivante par quartier** où le joueur possède un bien (4 ou 5 bâtiments par rue), voir [05-direction-artistique.md](../05-direction-artistique.md).
- Les quartiers de Dole sont **à valider** (voir [10-points-ouverts.md](../10-points-ouverts.md)). Première liste : Centre historique, Les Mesnils Pasteur, Les Paters, Plumont – Val Fleuri, Azans.

## Les déplacements

- **Trajet unique** entre deux villes : un temps (aller-retour) et un petit coût. Pas de choix de moyen de transport.
- Toute action dans une autre ville que la base ajoute ce temps de trajet. Exemple : une visite à Dijon depuis Dole coûte environ 1 h de visite plus 1 h 30 de trajet.
- Les trajets à l'intérieur d'une ville sont négligés.

## La journée sur place

- Le joueur regroupe plusieurs actions dans une même ville (2 visites, un rendez-vous bancaire, un état des lieux) sur une journée, généralement le week-end, avec **un seul trajet**.
- C'est l'usage principal de l'agenda léger.

## Gérer à distance

- Les incidents dans une ville éloignée coûtent plus de temps : **une agence locale** devient vite rentable.
- **Les artisans sont locaux** : le carnet est rangé par ville, il faut reconstruire un réseau à chaque expansion.
- **La notoriété locale** part de zéro dans chaque nouvelle ville.

## Déménager

- Louer ou acheter sa résidence principale dans une autre ville change la **base** : la nouvelle ville devient proche, les autres s'éloignent.
- Le métier est conservé (mutation implicite), sauf pour les métiers liés à un lieu, à préciser si besoin.

## La carte

- **Carte de la ville** : formes réelles simplifiées, dans le style illustré du jeu (voir [06-donnees.md](../06-donnees.md#la-carte-de-la-ville)).
- **Carte de la région** (puis de la France) : les villes intégrées, la base du joueur, les trajets, et une fiche par ville (prix, loyers, rendement, tension, tendance, trajet, frais de gestion à distance, notoriété locale, biens possédés).

## Ce qui a été réalisé au jalon 7

Valeurs de départ dans `content/villes.json` (trajets, frais à distance, notoriété, déménagement, flux d'annonces, demande), `content/travaux.json` (indice de coût des travaux par ville) et `content/artisans.json` (24 artisans fictifs par ville).

### Les villes et leurs données

- Dijon (8 quartiers), Besançon (7) et Chalon-sur-Saône (6) sont produites par les mêmes scripts que Dole (`pnpm --filter @cle/data-tools build-city dijon`). **Les regroupements d'IRIS en quartiers et leurs noms ont été choisis sans vérification sur place**, comme pour Dole : ils sont à relire (voir [10-points-ouverts.md](../10-points-ouverts.md)). Les noms de rues (`content/monde.json`) sont dans le même cas.
- Prix réels de départ (appartements, médiane des quartiers) : Dijon de 2 250 à 3 100 €/m², Besançon de 1 860 à 2 440 €/m², Chalon de 1 050 à 1 600 €/m² (Les Prés Saint-Jean, très peu de ventes, tire la fourchette vers le bas), Dole de 1 300 à 1 900 €/m². Les écarts avec les valeurs indicatives du tableau ci-dessus viennent des données.
- **Flux d'annonces** : Dijon vend huit fois plus que Dole, et tout afficher noierait le joueur. Chaque ville laisse passer une part de ses ventes réelles en annonces (`listingFlowShare` : Dole 1, Dijon 0,1, Besançon 0,3, Chalon 0,55), soit environ 1 annonce par jour à Dole, 0,8 à Dijon, 1,4 à Besançon, 1,2 à Chalon. Dijon était à 0,25 (2 annonces par jour) jusqu'à l'étape 1 de la progression : avec l'épargne plus forte, l'expansion n'y demandait plus d'effort (voir le chapitre 08).
- **Demande** (`demand`, relative à Dole) : les autres acheteurs prennent les annonces plus vite à Dijon (× 1,4) et à Besançon (× 1,15), plus lentement à Chalon (× 0,85) ; les candidats locataires se présentent plus souvent à Dijon (× 1,3) et à Besançon (× 1,2), moins à Chalon (× 0,75 : « plus de vacance »).
- **Travaux** : indice de coût de la main-d'œuvre par ville (Dole 0,95, Dijon 1,08, Besançon 1,03, Chalon 0,97).

### Les trajets

- Table symétrique dans `content/villes.json` (aller simple en minutes, coût de l'aller-retour) : Dole–Dijon 45 min et 12 €, Dole–Besançon 50 min et 12 €, Dole–Chalon 1 h et 15 €, Dijon–Chalon 40 min et 12 €, Dijon–Besançon et Chalon–Besançon 1 h 30 et 25 €. **Les trajets qui ne partent pas de Dole sont des estimations.**
- Toute action liée à un bien d'une autre ville que la **base** (visite, état des lieux, assemblée de copropriété, réparation soi-même, devis, travaux soi-même, visite de revente sans agence, rendez-vous avec un candidat) ajoute l'aller-retour en temps libre et son coût, **une seule fois par jour et par ville** : le deuxième rendez-vous du même jour dans la même ville ne paie plus le trajet. Les rendez-vous bancaires se tiennent dans la base. Dans une ville, les trajets restent négligés (20 minutes par visite, comme avant).
- **Journée sur place** : l'agenda groupe les actions sur un jour qui compte déjà un trajet vers la même ville (jusqu'à 7 jours d'attente, `dayOnSite.groupWithinDays`), si le temps libre du jour le permet. L'agenda affiche le trajet de chaque journée.

### Gérer à distance

- Un bien d'une autre ville que la base, **géré sans agence**, coûte **35 € par mois** (`remote.monthlyFeePerPropertyEuros`) : une ligne « frais de gestion » du bilan, déductible comme les autres charges. Une agence (la leur) supprime ce frais et les trajets du propriétaire pour les candidats et les états des lieux.
- La résidence principale est exclue de ce frais.

### La notoriété locale

- Part de zéro dans chaque ville. Chaque variation de la réputation globale causée par un bien (achat, revente avec plus-value, chantier, DPE gagné, année tranquille, locataire satisfait, vente forcée, procédure, expulsion, logement indécent, effets d'événements) déplace aussi la notoriété de la ville du bien, du même montant (`renown.share` = 1).
- Effets : une offre de bien hors marché est tirée dans une ville au prorata de sa notoriété (la base compte pour 10) ; en plus, chaque ville a une chance mensuelle de proposer un bien hors marché proportionnelle à sa notoriété (jusqu'à 30 % par mois à 100) ; la file d'attente des artisans de la ville se raccourcit de 0,4 point par point de notoriété. Les banques ne regardent que la réputation globale.

### Déménager

- Action `city/move` : le joueur loue un logement dans une autre ville (loyer = loyer de départ × rapport des loyers au m² des petits appartements, arrondi à 10 €), paie 600 € de déménagement et ne peut pas recommencer avant 270 jours. La base change : la nouvelle ville devient proche, les autres s'éloignent. Le métier est conservé.
- Si le joueur habite un logement qu'il possède, il ne peut pas déménager ainsi (il achète ou loue sa nouvelle résidence ailleurs, ou quitte d'abord son logement). Emménager dans un bien acheté dans une autre ville change aussi la base ; le quitter, c'est louer un logement dans la même ville.
- Le nouveau départ après une faillite ramène le joueur à Dole.

### La carte et les écrans

- **Villes** (menu) : carte schématique de la région (positions par longitude et latitude, trajets en pointillés avec leur durée) et une fiche par ville : trajet depuis la base, prix au m² (appartement, maison), loyer, rendement brut, tendance, ventes par an et annonces en ligne, frais à distance, notoriété, biens possédés, artisans connus, prix des travaux, avec « Voir la rue », « Voir les annonces » et « Déménager ici ».
- La rue, la carte de la ville, les annonces et la coupe d'immeuble suivent la **ville regardée** (la base par défaut). Chaque ville a ses couleurs de façades et son repère dans le décor (collégiale à Dole, tour Philippe le Bon à Dijon, citadelle à Besançon, tour du Doyenné à Chalon).
- Les événements sans bien (ville, France) se déclenchent dans une ville tirée au hasard parmi toutes celles du jeu.
