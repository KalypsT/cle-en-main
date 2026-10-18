# 3. Les systèmes de simulation

Chaque système est un module du moteur (`packages/engine`), sans interface. Il lit l'état du monde, applique les règles à chaque pas de temps et expose des **actions** que le joueur (ou un bot) peut déclencher.

| Fichier | Système | Jalon |
|---|---|---|
| [01-temps-et-personnage.md](01-temps-et-personnage.md) | Horloge, temps libre, agenda, métiers, résidence principale | 0, 1, 6 |
| [02-banque-et-credit.md](02-banque-et-credit.md) | Banques, banquiers, confiance, crédit, renégociation, découvert | 1 |
| [03-marche-et-annonces.md](03-marche-et-annonces.md) | Quartiers, biens, annonces, transactions, enchères, revente, rivaux | 1 |
| [04-location.md](04-location.md) | Baux, locataires, agences, incidents, impayés, DPE | 2 |
| [05-travaux-et-copropriete.md](05-travaux-et-copropriete.md) | Pièces, postes, gammes, artisans, chantier, copropriété | 3 |
| [06-fiscalite.md](06-fiscalite.md) | Impôts, régimes, plus-value, taxe foncière, IFI, comptable | 2, 8 |
| [07-evenements.md](07-evenements.md) | Événements, rythme, anecdotes, défis | 6 |
| [08-villes-et-deplacements.md](08-villes-et-deplacements.md) | Villes, quartiers, trajets, gestion à distance | 1, 7 |

## Principes communs

- **Déterminisme** : à graine et actions identiques, résultat identique. Aucun appel à `Math.random()` ni à l'horloge système dans le moteur.
- **Données, pas code** : tous les chiffres réglables (taux, coûts, probabilités, seuils) vivent dans `content/` et sont validés par des schémas.
- **Lisibilité pour le joueur** : chaque calcul qui touche l'argent doit pouvoir être **expliqué à l'écran** (« pourquoi ce taux ? », « d'où vient cet impôt ? »).
- **Testable par bots** : chaque action est accessible par l'API du moteur, sans passer par l'interface.
