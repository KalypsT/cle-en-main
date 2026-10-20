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
>
> **Jalon 2** : les bots louent ce qu'ils achètent et choisissent leur régime fiscal. Ils écartent les biens qu'ils ne pourraient pas louer assez longtemps (DPE) et comptent dans leur plan le mobilier d'un meublé, les charges non récupérées, la taxe foncière, l'assurance, l'agence et 5 % de vacance.
>
> | Bot | Location |
> |---|---|
> | Prudent | nu, au loyer de marché, gère lui-même, garantie loyers impayés ; écarte les biens interdits à la location avant 8 ans (donc les DPE E, F, G) ; régime recommandé |
> | Levier maximal | meublé, loyer de marché + 5 %, Agence Bonne Pioche, sans garantie ; loue nu s'il ne peut pas payer le mobilier ; régime recommandé |
> | Naïf | nu, loyer de marché + 15 %, gère lui-même, prend le premier candidat, reste au régime simple ; achète même ce qui ne se loue pas |
> | Chasseur | nu, au loyer de marché, gère lui-même, choisit le meilleur dossier ; écarte les biens interdits avant 5 ans ; régime recommandé |
>
> Le Chasseur loue nu : pour un salaire de la tranche à 11 %, le meublé (mobilier, comptable plus cher) rapporte moins que la location nue, et le mobilier ralentit les achats suivants ; essai sur 100 parties : 77 k€ de patrimoine médian en meublé contre 102 k€ en nu.

> **Jalon 3** : les bots rénovent (`packages/bots/src/renovation.ts`). Ils jugent une annonce sur sa valeur estimée après leurs travaux, coût (+20 % de marge) déduit, financent les travaux avec le prêt (enveloppe travaux, 27 ans si au moins 10 % du projet), demandent un diagnostic d'artisan des postes critiques encore inconnus avant leur offre, répondent aux imprévus et, sauf le Levier et le Naïf, vendent eux-mêmes un bien après 15 jours de découvert (avant la vente forcée à −20 %). Un bien vide impossible à louer depuis 120 jours est mis en vente.
>
> | Bot | Travaux |
> |---|---|
> | Prudent | décence, puis DPE ramené à D ; Standard, artisans les plus fiables |
> | Levier maximal | décence et DPE à D ; Éco, artisans les moins chers, imprévus passés en Éco |
> | Naïf | aucun |
> | Chasseur | décence et DPE à D ; Standard, artisans les moins chers ; réserve portée de 3 à 5 mensualités (4 000 € au moins) |
> | Marchand de biens | achète avec 22 % de marge sur la valeur après travaux, refait les postes à 3 ou moins qui rapportent plus qu'ils ne coûtent, la décence et le DPE à C, revend lui-même (3 % au-dessus de l'estimation, −3 % par mois) |
> | Rénovateur premium | achète sur la valeur actuelle (à l'estimation, 5 % en dessous avant le suivi du jalon 3), refait en Premium tout poste à 4 ou moins et vise le DPE B, artisans les plus fiables |

> **Jalon 7** : trois bots s'ajoutent, le **Chasseur à Dijon**, le **Chasseur à Besançon** et le **Chasseur à Chalon**. Ce sont des Chasseurs qui, **dès leur premier bien**, cherchent aussi dans une autre ville : ils n'y visitent que les annonces qu'ils pourraient financer (au plus 3 visites en attente, qui se regroupent sur un même jour avec un seul trajet), exigent **2 % de marge de plus** (« pour la peine »), et confient à l'agence Immo Zen (8 %) les biens qu'ils y achètent, ce qui supprime les frais de gestion à distance et les trajets de location. Le Chasseur sédentaire reste le « joueur raisonnable » de la section 8.1.
>
> Les bots ne comptent dans leur densité de décisions que les annonces des villes où ils habitent ou possèdent un bien.
>
> **Cibles du jalon** (le critère de la feuille de route, « une expansion à Dijon est viable mais demande un vrai effort », se mesure ainsi) :
>
> | Repère | Cible |
> |---|---|
> | Viable | médiane à 10 ans du Chasseur à Dijon d'au moins 90 % de celle du Chasseur, et pas plus de 3 points de faillites en plus |
> | Un vrai effort | premier achat à Dijon après plus de 24 mois (médiane), et moins de la moitié des parties y achètent en 10 ans |
> | Investisseur aguerri | 6 à 10 ans pour le Chasseur à Dijon (250 k€ nets et 2 villes) |
>
> Besançon et Chalon sont donnés pour information.

> **Jalon 7, réponses aux événements** : l'écart de mesure du jalon 6 (réputation finale de 0 ou 1) est corrigé : tous les bots investisseurs, sauf le Naïf, pèsent les choix des événements (argent, 300 € par point de réputation, 15 € par point de satisfaction). Conséquence : leur réputation finale monte à 100 et le Chasseur gagne environ 10 % de patrimoine à 10 ans (essai sur 60 parties : 84,8 k€ contre 76,0 k€ en 100 parties). **Le seuil de réputation de 90 du Baron de la pierre n'est donc plus un obstacle** (point ouvert n° 14). La notoriété locale d'une ville où le joueur n'a encore rien reste à zéro : elle ne facilite pas un premier achat, seulement les suivants.

> **Mesure du jalon 7** (`packages/bots/rapports/jalon-7.md` : 1 000 parties de 10 ans pour le Chasseur et le Chasseur à Dijon, 300 pour les autres bots) :
>
> | Repère | Résultat |
> |---|---|
> | Expansion à Dijon viable | médiane de 84 k€ contre 87 k€ pour le Chasseur (96 %), faillites 3 % contre 2,5 % : **atteint** |
> | Expansion à Dijon avec un vrai effort | premier achat à Dijon au 60e mois, 37 % des parties y achètent, 0,6 h de route par an : **atteint** |
> | Besançon, Chalon (information) | Besançon 86 k€ (57 % y achètent, au 49e mois) ; Chalon 80 k€ (87 % y achètent dès le 11e mois, faillites 4 %) |
> | Densité de décisions | Chasseur 50,6 s, Prudent 33,5 s : dans la cible de 30 à 60 s |
> | Investisseur aguerri (Chasseur à Dijon) | **manqué** : aucune partie n'atteint 250 k€ nets en 10 ans (écart connu depuis le jalon 1c ; seuil, durée cible ou rentabilité à trancher) |
> | Bailleur (Chasseur) | **manqué** : plus de 10 ans (atteint dans 41 % des parties) |
> | Le Levier peut progresser vite | **manqué** (écart connu) : 74 % de faillites, 9e décile de 29 k€ |
>
> Le Chasseur qui reste à Dole perd environ 10 % de patrimoine par rapport au jalon 6 sur 100 parties (non significatif, 1,6 écart-type) ; sur 1 000 parties sa médiane est de 87 k€.

> **Jalon 8, profondeur** : un bot s'ajoute, le **Promoteur**, et le Chasseur se sert de la SCI.
>
> | Bot | Réglages principaux |
> |---|---|
> | Chasseur | crée la SCI quand son taux d'endettement personnel atteint 30 % (et qu'il a au moins 2 biens) ; y achète quand son propre crédit est épuisé, en apportant lui-même les frais (par prudence : à 110 %, 4 parties sur 8 finissaient en faillite lors des essais) ; loue nu |
> | Promoteur | un Chasseur qui n'achète que ce qu'il peut transformer : immeuble vendu à la découpe, maison divisée, combles, construction sur un terrain. Il juge une annonce sur la valeur de ce que la transformation produit, son coût (+20 %) et 8 % de marge déduits ; écarte ce qui ne serait pas louable tout de suite ou interdit avant 5 ans ; crée la SCI dès son 1er bien et y fait prêter les frais ; réserve de 2 mensualités, plus les mois de chantier à venir ; cherche aussi à Dijon et à Besançon dès son 1er bien (Immo Zen) ; garde et loue nu les lots produits |
> | Autres bots | ne regardent que les appartements, maisons et immeubles, comme avant le jalon 8 : seul le Promoteur regarde aussi les locaux, parkings et terrains |
>
> **Cibles du jalon** (séries de 25 ans, seulement pour le Promoteur et le Chasseur ; révisées après la première mesure, voir plus bas) :
>
> | Repère | Cible d'origine | Cible révisée |
> |---|---|---|
> | Magnat | 25 à 50 % des parties en 25 ans, en 15 à 25 ans (médiane) | **10 à 25 %** des parties en 25 ans, en 15 à 25 ans (médiane) |
> | Baron de la pierre | moins de 5 % des parties en 25 ans | inchangée |
> | Promoteur | plus de 50 % des parties du bot Promoteur en 10 ans | plus de 50 % des parties du bot Promoteur **en 25 ans**, en **10 à 15 ans** (médiane) : c'est l'étape 4 sur 6 |
>
> **Première mesure** (300 parties de 25 ans, avec Magnat à 1,3 M€ après Promoteur et l'érosion de 2 points) : Baron 0 % ; Magnat 14,3 % pour le Promoteur, 0 % pour le Chasseur (il ne transforme jamais) ; Promoteur 13,3 % des parties en 10 ans, 60 % en 25 ans (13,4 ans) ; réputation finale médiane de 95,5 pour le Chasseur. D'où trois décisions : **Magnat à 1 M€**, après Investisseur aguerri, Marchand de biens **ou** Promoteur ; **érosion de 5 points par an** au-dessus de 80 ; cibles révisées ci-dessus.
>
> **Mesure finale du jalon 8** (`packages/bots/rapports/jalon-8.md` : 300 parties de 25 ans pour le Promoteur et le Chasseur, 150 pour le Chasseur à Dijon donné pour information) :
>
> | Repère | Résultat |
> |---|---|
> | Promoteur (bot Promoteur) | 59 % des parties en 25 ans, en 13,4 ans (médiane) : **atteint** (12,7 % en 10 ans) |
> | Baron de la pierre | 0 % pour tous les bots : **atteint** (5 M€ nets, 4 villes, réputation de 90) |
> | Magnat (Promoteur) | 25,7 % des parties, en 21,1 ans : **manqué de peu** (0,7 point au-dessus de la cible) |
> | Magnat (Chasseur) | **manqué** : 0,3 % (une partie sur 300). Il reste à Dole et n'est donc jamais Investisseur aguerri (2 villes) ; seule la voie Marchand de biens lui est ouverte (6,3 % des parties) |
> | Magnat (Chasseur à Dijon, information) | 4 % des parties, en 24 ans : Investisseur aguerri dans 74 % des parties (16,2 ans), mais 1 M€ net reste rare |
> | Patrimoine à 25 ans | Chasseur 370 k€ (D1 80 k€, D9 819 k€) ; Chasseur à Dijon 309 k€ ; Promoteur 226 k€ (D9 1,44 M€), très dispersé selon le métier |
> | Faillites en 25 ans | Chasseur 3,3 %, Chasseur à Dijon 4,7 %, Promoteur 8 % |
> | Bailleur (Chasseur) | 81 % des parties en 25 ans, en 9,3 ans (médiane) : toujours hors de la cible de 2 à 4 ans |
> | Densité de décisions | Chasseur 37,1 s : dans la cible ; Promoteur 16,5 s, trop dense en apparence : le bot compte toutes les annonces qu'il pourrait financer (160 par an, avec ses prêts à 110 %), ce qui ne correspond pas à ce que vit un joueur ; pas de changement |
> | Réputation finale (médiane) | Chasseur 91,4, Chasseur à Dijon 92,2, Promoteur 86,4 (95,5 et 91,7 avec l'érosion de 2 points) : plus basse, mais encore au-dessus des 90 du Baron pour les Chasseurs |
> | SCI | créée dans 81 % des parties du Chasseur (en 8,9 ans) et 93 % de celles du Promoteur (en 3,1 ans, 19 biens à la fin) |
> | SCI Horizon | arrive dans environ la moitié des parties, vers 18 à 21 ans, et achète 0,9 à 1,4 bien par an |
> | IFI | payé dans 12 % des parties du Promoteur, très rarement par le Chasseur |
>
> **Pourquoi le Promoteur obtient son titre tard** : il part avec 15 000 € et n'achète que ce qu'il peut transformer, des biens chers (immeubles, grandes maisons) dont les frais doivent être apportés tant qu'il n'a pas de SCI. Son premier achat arrive au 40e mois en médiane (21 parties sur 300 n'achètent jamais), sa première transformation vers 13 ans. Les métiers les mieux payés (développeur, commercial, agent immobilier) l'obtiennent dans 76 à 88 % des parties ; un fonctionnaire ou un électricien dans 37 à 42 %. Trois réglages du bot ont été essayés sur 42 parties de 25 ans (mêmes graines ; la série retenue y donne 21 % de Promoteur en 10 ans, 26 % de Magnat, 2 % de faillites) et **refusés** :
> - acheter aussi les bonnes affaires ordinaires, au prix du Chasseur ou avec 10 % de marge en plus : 90 à 98 % de faillites (les prêts de la SCI à 110 % sur des biens à cash-flow nul) ;
> - les mêmes, mais en apportant les frais des achats ordinaires : 29 % de faillites, 12 % de Promoteur en 10 ans, 14 % de Magnat ;
> - créer la SCI et chercher à Dijon et à Besançon dès le départ : 5 % de Promoteur en 10 ans, 7 % de Magnat, 10 % de faillites (la SCI coûte 1 500 € sur 15 000).
>
> Le constat de fond : une location nue financée à crédit a un cash-flow à peu près nul. Le patrimoine ne grandit vite que par la création de valeur (transformations) et par le levier de la SCI, et c'est la trésorerie de départ qui freine. D'où le choix de réviser la cible du titre Promoteur (étape 4 sur 6) plutôt que de rendre les transformations moins chères. **Reste ouvert** (point ouvert n° 5) : Magnat est hors de portée d'un joueur qui reste dans une seule ville sans revendre (voie Bailleur), car Investisseur aguerri demande 2 villes.

> **Jalon 8, série de contrôle** (`packages/bots/rapports/jalon-8-controle-10-ans.md` : 100 parties de 10 ans pour chaque bot, avec les règles finales ; plus 1 000 parties du Chasseur avant le changement de Magnat et de l'érosion, sans effet à 10 ans) : les repères des jalons 1 à 7 sont revenus au niveau du jalon 7 après trois corrections faites pendant la mesure :
> - les bots achetaient des parkings par dizaines (valeur connue exactement, donc toute annonce sous la valeur est une affaire sûre) : **frais de notaire minimaux de 1 500 €** et bots d'avant le jalon 8 limités aux logements et immeubles ;
> - les travaux d'un bien jamais loué n'étaient plus déduits de la plus-value (erreur du jalon 8) : l'impôt du Marchand de biens avait doublé ;
> - le Chasseur créait sa SCI dès son 2e bien et payait son comptable pendant des années pour presque rien (62,9 k€ à 10 ans sur 1 000 parties, 6,2 % de faillites) : il attend désormais 30 % d'endettement.
>
> | Repère (10 ans) | Jalon 7 | Jalon 8 |
> |---|---|---|
> | Chasseur, médiane (1 000 parties) | 87,2 k€, faillites 2,5 % | 85,5 k€, faillites 3,3 % |
> | Chasseur, Bailleur en 10 ans (1 000 parties) | 40,6 % | 43,7 % |
> | Chasseur à Dijon (100 parties) | 96 % de la médiane du Chasseur, faillites 3 % | 98 %, faillites 2 % contre 1 % : viable, avec un vrai effort (1er achat au 66e mois, 43 % y achètent) |
> | Prudent | 75,8 k€, 1er achat au 31e mois | 71,0 k€, au 36e mois |
> | Marchand de biens | 33,2 k€, 12,1 k€ d'impôt sur les plus-values | 37,2 k€, 13,4 k€ |
> | Rénovateur premium | 30,2 k€ | 27,8 k€ |
> | Levier maximal | 74 % de faillites | 77 % |
> | Chasseur à Chalon (information) | 80,2 k€, faillites 4 % | 63,3 k€, faillites 8 % (100 parties) |
>
> Les cibles atteintes et manquées sont les mêmes qu'au jalon 7 (Bailleur, Investisseur aguerri et Levier toujours manqués) ; le seuil d'Investisseur aguerri abaissé à 150 k€ ne suffit pas (5 % des parties du Chasseur à Dijon en 10 ans, 74 % en 25 ans).

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
> - la densité de décisions est mesurée depuis le jalon 6 (voir le rapport ci-dessous).
>
> **Rapport du jalon 2** (`packages/bots/rapports/jalon-2.md`, 1 000 parties de 10 ans par bot) : 7 cibles sur 9 atteintes.
> - Le Chasseur atteint « Bailleur » en 2,9 ans et finit à 97 k€ nets (134 k€ au jalon 1c) : la vraie fiscalité, les charges et les aléas pèsent plus que l'ancien forfait de 30 %. 45 % de ses parties connaissent au moins une vente forcée (5,4 % de faillites) : sa réserve de 3 mensualités est mince face aux chocs de trésorerie (procédure, chauffe-eau, taxe foncière, comptable).
> - « Investisseur aguerri » reste manqué (écart connu, jalons 3 et 7).
> - « Le Levier peut progresser vite » est manqué de peu : son 9e décile (73,8 k€) frôle la médiane du Prudent (74,5 k€), avec 42,7 % de faillites. Le Levier meublé souffre du coût du mobilier et des locataires fragiles de Bonne Pioche. Ce n'est pas recalibré dans le contenu : l'écart est faible et dépend surtout des réglages du bot ; à revoir avec les travaux (jalon 3), qui donnent au levier de quoi créer de la valeur.
> - Le Naïf (99,5 % de faillites) achète au prix affiché des biens parfois impossibles à louer (ruines, DPE G) : il « perd », comme prévu, plus nettement qu'au jalon 1c.
>
> **Rapport du jalon 3** (`packages/bots/rapports/jalon-3.md`, 1 000 parties de 10 ans par bot, série découpée par bot puis fusionnée) : 9 cibles sur 12.
> - Le Chasseur : premier achat en 1,2 mois, 96 k€ nets à 10 ans, faillites 1,4 % (5,4 % au jalon 2), ventes forcées 24 % (45 %) grâce à la réserve de 5 mensualités et à la vente volontaire en découvert. **Le titre Bailleur recule à 8,5 ans** (2,9 ans au jalon 2, atteint dans 55 % des parties) : réserve plus épaisse, diagnostics avant offre, biens indisponibles pendant les travaux. À revoir.
> - « Investisseur aguerri » reste manqué (écart connu, jalons 7 et 8).
> - « Le Levier peut progresser vite » reste manqué (9e décile 55 k€ contre 79 k€ de médiane pour le Prudent ; 65,6 % de faillites).
> - Le Marchand de biens dépasse à peine l'Inactif (34 k€, 2,1 reventes par partie, 12,9 k€ d'impôt sur les plus-values) : un particulier qui revend en moins de 5 ans paie 36,2 % de la plus-value, 7,5 % de frais de notaire et des indemnités de remboursement anticipé, ce que le statut réel de marchand de biens (non modélisé) allège.
> - Le Rénovateur premium n'écrase personne (33,5 k€) : il achète très peu, le Premium coûte bien plus qu'il ne rapporte sous le plafond des quartiers (3e quartile).
> - Les travaux : 0,3 à 1,9 imprévu par chantier ; plus aucune passoire gardée par les bots qui louent.
>
> **Suivi du jalon 3** (séries courtes de 100 parties de 10 ans, sans nouveau rapport complet) :
> - Marge sur les travaux ramenée de 1,2 à 1,1 pour le Chasseur : Bailleur plus tôt (5,4 ans contre 6,4) mais ventes forcées de 32 % à 38 % et faillites de 2 % à 5 %. **Refusé** : la marge reste à 1,2. Le diagnostic limité aux biens d'avant 1975 n'a pas été essayé.
> - Rénovateur premium, seuil d'achat de 1,05 à 1,0 : 71 % des parties font un achat (47 % avant), 1 bien en médiane (0 avant), 29,7 k€ à 10 ans (31,4 k€), faillites 4 % (1 %). Il reste très loin du Chasseur (84 k€). **Retenu**.

> **Rapport du jalon 6** (série courte : 100 parties de 10 ans pour le Chasseur et le Prudent, pas de rapport complet de 1 000 parties) :
> - Densité de décisions : au départ, **Chasseur 42 s** par décision à ×1 (de 40 à 47 s selon le métier) mais **Prudent 29 s** (de 24 à 32 s), un peu trop dense. Le Prudent garde sa trésorerie et voit donc beaucoup d'annonces « intéressantes » qu'il pourrait financer (54 par an, contre 17 pour le Chasseur, qui a placé la sienne). Réglage : les heures passées à ×1 après une nouvelle décision (`quietHours` de `content/rythme.json`) passent de 4 à 18. Série courte de contrôle : **Chasseur 50 s** (de 48 à 55 s selon le métier), **Prudent 37 s** (de 32 à 40 s), tous deux dans la cible de 30 à 60 s. Ni le patrimoine, ni les faillites des bots ne changent (la mesure du rythme n'agit pas sur la partie).
> - Temps accéléré : 99 % du temps de jeu ; environ 0,6 heure réelle par an de jeu. Environ 110 anecdotes, 17 à 29 événements, 1,5 à 1,7 défi proposé par an.
> - Le Chasseur : premier achat en 1,1 mois, 84 k€ nets à 10 ans (Prudent 62 k€), faillites 2 %, ventes forcées 32 %. Bailleur en 6,4 ans (47 % des parties) : toujours hors de la cible de 2 à 4 ans, mais mieux qu'au jalon 3 (8,5 ans). « Investisseur aguerri » reste manqué.
> - **Limite de mesure** : les bots répondent aux événements par leur choix par défaut, et 13 événements sur 107 pénalisent la réputation par défaut (« attendre »). La réputation finale médiane est donc de 0 à 1 chez le Chasseur et le Prudent, alors qu'un joueur qui répond la ferait monter. Les avantages de réputation (marge bancaire, biens hors marché) ne sont pas mesurés par les bots.
