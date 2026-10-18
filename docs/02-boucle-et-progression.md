# 2. Boucle de jeu et progression

## 2.1 Le début de partie

- La partie démarre à la **date réelle du jour** où elle est créée, et le calendrier avance ensuite (2026, 2027…). Les lois datées (calendrier du DPE) s'appliquent à leurs vraies dates.
- Le joueur choisit : un **nom**, un **avatar**, un **métier** (voir [03-systemes/01](03-systemes/01-temps-et-personnage.md)) et un **mode de partie**.
- Tout le monde démarre :
  - à **Dole**, locataire d'un petit T2 (loyer indicatif : 520 €/mois) ;
  - avec le **même apport** : **15 000 €** d'épargne ;
  - sans aucun bien, avec une réputation de départ faible.
- Le **didacticiel** (désactivable) accompagne le premier mois, voir [04-interface.md](04-interface.md).

## 2.2 Les trois échelles de temps

| Échelle | Ce qui se passe |
|---|---|
| **Au quotidien** | Nouvelles annonces, visites, candidatures de locataires, incidents, avancement des chantiers, dépense du temps libre du jour |
| **Chaque mois** | Salaire, loyers, mensualités, charges, honoraires d'agence, petit bilan affiché, sauvegarde automatique de secours |
| **Chaque année** | Impôts, taxe foncière (automne), réévaluation des biens, révision des loyers, assemblées de copropriété, **bilan annuel**, nouveau titre éventuel |

## 2.3 La vitesse du temps

- Vitesses : **pause, ×1, ×2, ×4**.
- À **×1**, une journée de jeu dure **environ 20 secondes**. Un mois dure environ 10 minutes, une année environ 2 heures.
- **Accélération automatique** (activée par défaut, désactivable) : quand aucune décision n'est en attente et que rien n'est prévu, le temps passe en ×4, puis revient en ×1 au prochain événement.
- **Pause automatique** pour les décisions importantes : offre reçue, incident grave, enchère, assemblée de copropriété.

## 2.4 La boucle principale

```
Repérer une opportunité ─► Visiter / diagnostiquer ─► Financer (banque)
        ▲                                                   │
        │                                                   ▼
  Réinvestir ◄── Encaisser (loyers, plus-values) ◄── Rénover ─► Louer ou revendre
        │
        └─► Réputation ↑ ─► meilleures conditions, biens hors marché, nouveaux titres
```

Le temps libre, la trésorerie et la capacité d'emprunt sont les trois contraintes qui obligent à choisir.

## 2.5 Les modes de partie

Choisis à la création, ils règlent la faillite, le retour en arrière et, raisonnablement, la difficulté. Les coefficients vivent dans une seule table de contenu.

| | Serein | Classique (par défaut) | Exigeant |
|---|---|---|---|
| Imprévus de chantier et incidents | −30 % | normal | +20 % |
| Rivaux | plus lents | normaux | plus vifs |
| Confiance des banquiers | monte plus vite | normale | monte plus lentement |
| Faillite | seulement des saisies | nouveau départ | fin de partie |
| Retours en arrière | illimités | 3 par partie | aucun |

## 2.6 La faillite

### Une descente progressive

La faillite doit se voir venir et pouvoir s'éviter :

1. **Alerte de trésorerie** : la trésorerie prévue passe sous zéro dans les 30 jours.
2. **Découvert** : solde négatif, agios quotidiens, la confiance du banquier baisse chaque jour.
3. **Gel du crédit** : la banque refuse tout nouveau prêt.
4. **Vente forcée** : après une durée de découvert, la banque impose la vente d'un bien (choisi par le joueur si possible), avec une décote.
5. **Faillite** : seulement si le patrimoine net reste négatif après les ventes forcées.

> **Jalon 1c** : la descente est codée jusqu'à la faillite (`content/credit.json`, `distress`). Après **90 jours** de découvert, la banque vend les biens au prix réel moins **20 %**, en commençant par celui qui rapporte le plus de trésorerie, jusqu'à ramener le compte au-dessus de zéro ; chaque vente forcée coûte 15 points de confiance à la banque du compte. Sans bien restant et avec un patrimoine net négatif, le moteur déclare la faillite (`bankrupt`). L'alerte de trésorerie arrive avec l'interface (jalon 4), le nouveau départ au jalon 6.

### Le nouveau départ (mode Classique)

Le joueur reste dans le **même monde** et redevient salarié dans son métier, à Dole, avec un petit apport (valeur à calibrer, par exemple 5 000 €).

Il **garde** : ses titres, ses succès, sa chronique, son carnet d'artisans et une partie de sa réputation (par exemple 50 %).
Il **perd** : tous ses biens, ses crédits et sa trésorerie.

La partie n'est jamais perdue, mais la chute fait mal.

## 2.7 Le retour en arrière

- **Sauvegarde automatique le 1er de chaque mois**, en gardant les **6 derniers mois**.
- Écran « **Revenir en arrière** » : liste des points avec la date et le patrimoine net à cette date.
- Nombre de retours selon le mode : illimité (Serein), 3 par partie (Classique), aucun (Exigeant).
- Techniquement simple : l'état complet du jeu est sérialisable (voir [07-architecture.md](07-architecture.md)).

## 2.8 La réputation

- **Réputation globale (0 à 100)** : la note principale. Elle compte pour les banques, les rivaux et les titres.
- **Notoriété locale par ville** : secondaire, affichée sur la fiche de la ville. Elle compte surtout pour les agents et les artisans locaux.

| La réputation monte avec… | Elle baisse avec… |
|---|---|
| Achats et ventes réussis | Impayés mal gérés |
| Rénovations, surtout quand le DPE gagne des classes | Logement mal entretenu ou indécent |
| Locataires satisfaits | Vente forcée |
| Années sans incident | Conflit avec un locataire |

**Effets** : meilleures conditions bancaires, biens hors marché proposés par les agents, priorité chez les bons artisans, respect (ou jalousie) des rivaux.

## 2.9 Les titres

Deux branches qui se rejoignent. Les seuils sont à calibrer.

| Étape | Branche Bailleur | Branche Marchand de biens |
|---|---|---|
| Départ | Locataire ambitieux | Locataire ambitieux |
| 1 | Primo-investisseur (premier bien) | Primo-investisseur (premier bien) |
| 2 | Bailleur (3 biens loués) | Rénovateur (3 rénovations terminées) |
| 3 | Investisseur aguerri (patrimoine net de 250 k€, 2 villes) | Marchand de biens (5 reventes avec plus-value) |
| 4 | Promoteur (division ou transformation d'un bien, jalon 8) | Promoteur |
| 5 | **Magnat** (patrimoine net de 1,3 M€, l'IFI arrive) | **Magnat** |
| Ultime | **Baron de la pierre** (5 M€ net, 4 villes, réputation de 90) | **Baron de la pierre** |

Chaque titre apporte un **petit avantage** (une marge bancaire réduite, un agent de plus qui appelle) et une **scène de célébration** dans la rue.

Durées cibles, voir [08-equilibrage.md](08-equilibrage.md).

## 2.10 Succès, défis, chronique et statistiques

- **Environ 40 succès**, par exemple :
  - « De G à B » : rénover un bien de la classe G à la classe B ;
  - « Le compte est bon » : 12 mois de cash-flow positif ;
  - « Mme Delaporte en larmes » : battre Monique Delaporte 5 fois sur une affaire ;
  - « Elle a souri » : confiance maximale avec Hortense Rigueur ;
  - « Chef de chantier » : 10 chantiers terminés ;
  - « Chez moi » : acheter sa résidence principale.
- **Défis optionnels**, rares (2 ou 3 par an de jeu, jamais deux en même temps), lancés par un personnage avec une échéance et une récompense en réputation. Exemples :
  - Kévin Boost : « Un bien à Besançon avant fin 2027, tu relèves ? »
  - Monique Delaporte : « Je vous parie que vous ne trouverez pas mieux que moi à Dole. »
  - Yvon Tableur : « Zéro impôt sur vos loyers cette année ? »
- **Chronique de carrière** : journal des grandes étapes (premier achat, première crise, nouveau titre).
- **Statistiques** : courbes sur le long terme (patrimoine, loyers, endettement, cash-flow) et records (meilleure plus-value, plus beau chantier).

Les succès et les statistiques suffisent comme moteur à long terme : pas de collection ni d'objectif imposé.
