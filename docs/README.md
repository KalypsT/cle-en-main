# Clé en main ! — Document de spécifications et de conception

> Jeu de gestion immobilière en temps réel, pour téléphone (PWA), joué en solo dans des villes françaises réelles.
> Titre provisoire : **Clé en main !**

Ce dossier est la référence de conception du jeu. Il est découpé en fichiers courts pour que chaque session de développement (avec Claude Code) ne lise que les chapitres utiles à son jalon.

## Sommaire

| # | Fichier | Contenu |
|---|---|---|
| 1 | [01-vision.md](01-vision.md) | Pitch, piliers, ce que le jeu n'est pas, public, ton |
| 2 | [02-boucle-et-progression.md](02-boucle-et-progression.md) | Boucle de jeu, échelles de temps, modes de partie, faillite, retour en arrière, réputation, titres, succès |
| 3 | [03-systemes/](03-systemes/README.md) | Les systèmes de simulation, un fichier par système |
| 4 | [04-interface.md](04-interface.md) | Orientation, navigation, inventaire des écrans, didacticiel |
| 5 | [05-direction-artistique.md](05-direction-artistique.md) | Style, palette, façades, personnages, animations, typographie, son |
| 6 | [06-donnees.md](06-donnees.md) | Sources de données réelles, scripts, contenu écrit, génération |
| 7 | [07-architecture.md](07-architecture.md) | Stack, organisation du repo, moteur, sauvegardes, tests, déploiement |
| 8 | [08-equilibrage.md](08-equilibrage.md) | Cibles chiffrées, bots, leviers de difficulté, fin de partie |
| 9 | [09-feuille-de-route.md](09-feuille-de-route.md) | Jalons 0 à 9 et critères de « terminé » |
| 10 | [10-points-ouverts.md](10-points-ouverts.md) | Décisions encore à prendre |
| — | [maquettes/](maquettes/README.md) | Maquettes préliminaires (indicatives) |

### Systèmes (chapitre 3)

| Fichier | Système |
|---|---|
| [01-temps-et-personnage.md](03-systemes/01-temps-et-personnage.md) | Horloge, temps libre, agenda, métiers, résidence principale |
| [02-banque-et-credit.md](03-systemes/02-banque-et-credit.md) | Banques, banquiers, confiance, règles de crédit, renégociation, découvert |
| [03-marche-et-annonces.md](03-systemes/03-marche-et-annonces.md) | Quartiers, biens, annonces, offre, compromis, enchères, revente, rivaux |
| [04-location.md](03-systemes/04-location.md) | Baux, candidatures, agences, vie du bail, impayés, DPE |
| [05-travaux-et-copropriete.md](03-systemes/05-travaux-et-copropriete.md) | Pièces, postes, gammes, artisans, chantier, imprévus, copropriété |
| [06-fiscalite.md](03-systemes/06-fiscalite.md) | Impôt sur les loyers, régimes, plus-value, taxe foncière, IFI, comptable |
| [07-evenements.md](03-systemes/07-evenements.md) | Catalogue d'événements, rythme, anecdotes, défis |
| [08-villes-et-deplacements.md](03-systemes/08-villes-et-deplacements.md) | Villes, quartiers, trajets, journée sur place, gestion à distance |

## Que lire selon le jalon

| Jalon | Chapitres à lire |
|---|---|
| 0 – Fondations | 07, 09 |
| 1 – Noyau économique | 01, 02, 03/01, 03/02, 03/03, 06, 07, 08 |
| 2 – Location et fiscalité | 03/04, 03/06, 08 |
| 3 – Travaux | 03/05, 08 |
| 4 – Première tranche jouable | 04, 05 (interface), maquettes, 02 |
| 5 – Monde vivant | 05, 04 |
| 6 – Rythme et progression | 02, 03/07, 08 |
| 7 – Villes | 03/08, 06 |
| 8 – Profondeur | 03 (tous), 08 |
| 9 – Finitions | 08, 09 |

## Conventions de ce document

- **Les chiffres** (salaires, coûts, taux, durées) sont des **valeurs de départ à calibrer** par les bots et les parties de test, sauf mention contraire. Ils vivent dans les fichiers de contenu, pas dans le code.
- **Les règles réelles** (crédit, fiscalité, DPE, baux) sont **simplifiées mais crédibles**. Elles reflètent la situation connue en octobre 2026 et doivent être revérifiées au moment de coder le système concerné.
- **Les personnages et entreprises** (banques, agences, rivaux, artisans) sont **fictifs**.
- **Le jeu est en français uniquement.**
- Quand une décision change en cours de réalisation, on met à jour le chapitre concerné **et** on l'inscrit dans le journal des décisions de [10-points-ouverts.md](10-points-ouverts.md).

## Statut

- Version : 0.1 (conception initiale), octobre 2026.
- Public : usage privé (Thibaud et sa femme).
