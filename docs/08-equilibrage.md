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

- **Rapport d'équilibrage** généré par `packages/bots` à chaque modification significative : courbes médianes et dispersion (patrimoine, cash-flow, endettement, faillites) par stratégie, par ville et par mode. Alerte si une cible est dépassée.
- **Parties humaines** (Thibaud et sa femme) à chaque jalon jouable.
- **Journal de partie** exportable depuis les réglages (stocké uniquement sur le téléphone) pour comprendre ce qui a été trop facile ou trop difficile.
- Ce qui a été trop facile ou trop dur se corrige **dans le contenu**, puis se vérifie par les bots.
