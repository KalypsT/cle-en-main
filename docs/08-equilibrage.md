# 8. Équilibrage et difficulté

Principe : **l'équilibrage se fait par simulation**, avec des bots qui jouent des milliers de parties. Les humains ne jouent vraiment qu'aux jalons, pour juger le plaisir, pas pour chercher les chiffres.

## 8.1 Cibles chiffrées

Pour un joueur raisonnable en mode Classique, au départ de Dole :

| Repère | Cible |
|---|---|
| Premier achat | entre le 2e et le 6e mois |
| Titre Bailleur | 2 à 4 ans de jeu |
| Investisseur aguerri | 6 à 10 ans |
| Magnat | 15 à 25 ans |
| Baron de la pierre | plus de 30 ans, et pas à chaque partie |
| Densité de décisions | une toutes les 30 à 60 secondes réelles (à ×1) |

## 8.2 Les bots

| Bot | Comportement | Résultat attendu |
|---|---|---|
| **Prudent** | Achète sous la valeur, garde une réserve, endettement modéré | Progresse lentement, faillite dans moins de 5 % des parties |
| **Levier maximal** | Emprunte au maximum, aucune réserve | Peut progresser vite, mais faillite dans plus de 40 % des parties |
| **Chasseur de bonnes affaires** | Visite beaucoup, n'achète que les écarts de prix | Bon rendement, limité par le temps libre |
| **Marchand de biens** | Achète, rénove, revend | Plus-values, sensible aux cycles |
| **Rénovateur premium** | Premium partout | Ne doit pas dominer (plafond des quartiers) |
| **Naïf** | Achète au prix affiché sans visiter | Stagne ou perd de l'argent |
| **Inactif** | Ne fait rien | **Ne s'enrichit jamais** (test anti-idle) |
| **Aléatoire** | Actions au hasard | Rien ne plante, aucun état incohérent |

**Aucune stratégie ne doit dominer** les autres dans toutes les villes et dans tous les cycles de marché.

> **Jalon 1c** : Prudent, Levier maximal, Naïf, Chasseur de bonnes affaires et Inactif sont codés dans `packages/bots/src/strategies.ts`, comme des profils d'une même routine de décision (visites, offre, financement, réserve). Ils ne voient que ce que voit le joueur (estimations, jamais la valeur réelle) et jouent seulement par des actions du moteur, chaque jour à 18 h.
>
> | Bot | Réglages principaux |
> |---|---|
> | Prudent | 1 visite par jour ; achète à 5 % au moins sous l'estimation, offre d'abord à 94 % du prix ; apport de 3 % en plus des frais ; réserve de 6 mensualités (3 000 € au moins) ; 20 ans ; endettement ≤ 30 % ; cash-flow positif exigé ; évite les ruines |
> | Levier maximal | achète jusqu'à 2 % au-dessus de l'estimation ; aucun apport au-delà des frais, aucune réserve ; 25 ans ; accepte les durées allongées ; Crédit Fougueux d'abord |
> | Naïf | une fois par semaine, une annonce au hasard qu'il peut financer, au prix affiché, sans visite ; 25 ans |
> | Chasseur | jusqu'à 4 visites par jour ; achète à 10 % au moins sous l'estimation, offre d'abord à 92 % ; réserve de 3 mensualités (3 000 € au moins) ; 25 ans ; endettement ≤ 35 % |
> | Inactif | ne fait rien |
>
> Le Marchand de biens et le Rénovateur premium attendent les travaux (jalon 3), l'Aléatoire viendra avec l'interface complète.

## 8.3 Les leviers de difficulté

Tous sont des paramètres de contenu :
- flux et qualité des annonces ;
- agressivité des rivaux ;
- fréquence des incidents et des imprévus ;
- volatilité du marché et fréquence des chocs ;
- exigence et marges des banques ;
- coûts de travaux et fiabilité des artisans.

Les modes de partie appliquent des coefficients raisonnables sur certains de ces leviers (voir [02-boucle-et-progression.md](02-boucle-et-progression.md#25-les-modes-de-partie)).

## 8.4 La fin de partie

Risque classique : une fois riche, tout devient facile (effet boule de neige). Contrepoids :
- l'**IFI** au-delà de 1,3 M€ ;
- le **temps** nécessaire pour gérer un grand patrimoine, et le **coût** de la délégation ;
- la **SCI Horizon Patrimoine**, qui arrive tard et vise les gros biens ;
- les **crises rares** ;
- le **plafond de valeur** des quartiers ;
- de **nouveaux horizons** : d'autres villes, Paris en mode défi.

## 8.5 Le suivi

- **Rapport d'équilibrage** (`pnpm bots:series`, voir [CLAUDE.md](../CLAUDE.md)) généré par `packages/bots` à chaque modification significative : courbes médianes et dispersion (patrimoine, cash-flow, endettement, faillites) par stratégie, par ville et par mode. Alerte si une cible est dépassée.
- **Parties humaines** (Thibaud et sa femme) à chaque jalon jouable.
- **Journal de partie** exportable depuis les réglages (stocké uniquement sur le téléphone) pour comprendre ce qui a été trop facile ou trop difficile.
- Ce qui a été trop facile ou trop dur se corrige **dans le contenu**, puis se vérifie par les bots.

> **Lecture des cibles au jalon 1c** :
> - le « joueur raisonnable » de la section 8.1 est le **Chasseur** ; le Prudent, qui « progresse lentement », est donné pour information ;
> - les titres n'existent pas encore (jalon 6) : « Bailleur » se mesure à 3 biens loués en même temps, « Investisseur aguerri » à 250 k€ nets sans la condition des 2 villes ; Magnat et Baron dépassent l'horizon de 10 ans ;
> - « l'Inactif ne s'enrichit jamais » : pour chaque métier, sa médiane reste sous l'apport plus 250 € d'épargne par mois (le haut de la fourchette du chapitre 3.1) ;
> - « le Naïf stagne ou perd » : sa médiane ne dépasse pas celle de l'Inactif ;
> - la densité de décisions attend l'interface et l'agenda (jalons 4 et 6).

