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
