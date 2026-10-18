# 3.1 Temps et personnage

## L'horloge

- Le temps de jeu avance **heure par heure** pour l'agenda et les animations, et **jour par jour** pour l'économie (loyers, prix, crédits, intérêts).
- Vitesses, pauses et accélération automatiques : voir [02-boucle-et-progression.md](../02-boucle-et-progression.md#23-la-vitesse-du-temps).
- Le calendrier est réel : jours de la semaine, week-ends, jours fériés, vacances scolaires (zone A pour la Bourgogne-Franche-Comté), saisons.

## Le temps libre

C'est la ressource qui empêche le jeu de devenir idle, et l'unique « gestion de vie » du personnage.

- Chaque jour donne un **capital de temps libre** selon le métier et le calendrier (voir le tableau des métiers).
- Le temps libre **non utilisé est perdu chaque soir.**
- Les actions qui coûtent du temps (valeurs de départ) :

| Action | Temps |
|---|---|
| Visite d'un bien | 1 h + trajet |
| Rendez-vous avec un banquier | 1 h |
| Demande de devis | 30 min |
| État des lieux (entrée ou sortie) | 1 h |
| Gérer un incident soi-même | 1 h |
| Visites de vente sans agence | 1 h par visite |
| Travaux faits soi-même | plusieurs heures par jour, selon le poste |
| Assemblée de copropriété | 2 h (facultatif) |

- Les actions déléguées (agence, artisan, maître d'œuvre) ne coûtent pas de temps, mais coûtent de l'argent.

## L'agenda léger

- Une action demandée sans assez de temps libre ce jour-là est **planifiée automatiquement** au prochain créneau disponible (souvent le week-end).
- Le joueur voit sa semaine sous forme de liste, peut déplacer ou annuler une action.
- **Journée sur place** : regrouper plusieurs actions dans une même ville avec un seul trajet (voir [08-villes-et-deplacements.md](08-villes-et-deplacements.md)).
- Pas de calendrier détaillé à gérer : l'agenda reste un outil d'aide.

## Les métiers

Chaque métier change trois choses : le **salaire**, le **temps libre** et la **confiance bancaire de départ**. Valeurs à calibrer.

| Métier | Salaire net indicatif | Temps libre | Confiance bancaire | Particularité |
|---|---|---|---|---|
| **Fonctionnaire** | 2 000 €/mois | 2 h 30 en semaine, 6 h le week-end, RTT régulières | très élevée | Le profil le plus rassurant pour les banques |
| **Enseignant** | 2 200 €/mois | 2 h en semaine, 6 h le week-end, 8 h par jour pendant les vacances scolaires | élevée | Les vacances scolaires sont des fenêtres d'action |
| **Infirmier** | 2 300 €/mois | horaires décalés : des jours à 0 h, des jours de repos à 7 h | élevée | Disponible en semaine quand les autres travaillent |
| **Développeur** | 3 100 €/mois | 3 h en semaine (télétravail), 6 h le week-end | élevée | Bon salaire et du temps |
| **Électricien** | 2 100 €/mois | 2 h en semaine, 6 h le week-end | moyenne | Peut faire lui-même les postes d'électricité |
| **Commercial** | 2 000 € + primes (moyenne 2 700 €) | 1 h 30 en semaine, 6 h le week-end | moyenne à faible (revenus variables) | Négocie mieux les prix d'achat |
| **Agent immobilier** | 1 800 € + commissions (moyenne 2 500 €) | 1 h 30 en semaine, 4 h le week-end (travaille le samedi) | moyenne à faible | Voit certaines annonces 24 à 48 h avant tout le monde |

### Démissionner

- Possible à tout moment depuis la fiche du personnage.
- Effets : beaucoup plus de temps libre (8 h par jour), plus de salaire.
- Les banques ne retiennent alors que les revenus locatifs (à 70 %) et exigent un historique solide : démissionner trop tôt bloque le crédit.
- Reprendre un emploi est possible, avec un délai de recherche.

## Le train de vie

- Chaque mois, le personnage paie ses **dépenses de vie** (hors loyer) : elles suivent son revenu, si bien que l'**épargne de salaire reste faible** (environ 100 à 250 € par mois selon le métier).
- On s'enrichit donc en investissant, pas en attendant : l'apport de départ compte vraiment.
- Sans emploi, les dépenses de vie tombent à un minimum (valeur indicative : 900 €/mois).
- Valeurs dans `content/train-de-vie.json`.

## Le logement du personnage

- Au départ, le joueur est **locataire** à Dole. Son loyer est une charge mensuelle et compte dans son « reste à vivre ».
- Il peut **acheter sa résidence principale** à tout moment :
  - plus de loyer à payer, mais une mensualité qui pèse sur l'endettement sans loyer en face ;
  - **exonération de plus-value** à la revente (règle réelle) ;
  - la ville de la résidence principale est la **base** pour le calcul des trajets.
- **Déménager** (louer ou acheter ailleurs) change la base.

## L'identité

- Seulement un **nom** et un **avatar** composé (visage, coiffure, teint, tenue).
- Pas de situation familiale ni de jauge d'énergie ou de moral.
