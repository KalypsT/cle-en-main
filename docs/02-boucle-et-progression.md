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

> **Jalon 6** : le **bilan mensuel** s'ouvre le 1er de chaque mois (désactivable dans les Réglages) : flux du mois par famille, solde, patrimoine net et son évolution, loyers, réputation, série de mois positifs, titres et succès du mois. Le **bilan annuel** s'ouvre le 1er janvier, à la place du bilan mensuel : Yvon Tableur salue, donne au plus 4 conseils choisis par le moteur (évolution du patrimoine, interdiction DPE proche, réserve mince, endettement, logement vide, meilleur régime fiscal, impôt nul ou élevé, déficit reporté, crédit à renégocier, année positive ou négative, premier achat), puis les chiffres de l'année (patrimoine, solde, loyers, impôt sur les loyers, honoraires, réputation, titres et succès). Textes et seuils dans `content/textes/yvon.json`. Les deux bilans jouent l'emplacement de musique « célébration ».

## 2.3 La vitesse du temps

- Vitesses : **pause, ×1, ×2, ×4**.
- À **×1**, une journée de jeu dure **environ 20 secondes**. Un mois dure environ 10 minutes, une année environ 2 heures.
- **Accélération automatique** (activée par défaut, désactivable) : quand aucune décision n'est en attente et que rien n'est prévu, le temps passe en ×8 (×4 avant l'étape 4 de la progression), puis revient à la vitesse choisie au prochain événement.
- **Pause automatique** pour les décisions importantes : offre reçue, incident grave, enchère, assemblée de copropriété.

> **Jalon 6** : l'accélération automatique (réglage activé par défaut) ne s'applique qu'à la vitesse ×1. Le moteur dit si la partie est « calme » (`pace`) : aucune décision dont l'échéance tombe dans le jour qui vient, rien dans l'agenda dans les 24 heures. Les décisions durables (logement vide, avertissement DPE, renégociation possible, devis qui expire, alerte de trésorerie) ne retiennent jamais l'accélération. Toute **nouvelle** décision ramène le temps à ×1 pendant 18 heures de jeu (4 au départ, relevé après mesure des bots : voir le chapitre 08). Valeurs dans `content/rythme.json`. La pause automatique s'étend aux défis proposés, aux incidents graves (chauffe-eau, fuite, chauffage : `content/decisions.json`) et aux événements du catalogue marqués `pause`. Une fois réglées **toutes** les décisions qui ont mis le jeu en pause, le temps repart à la vitesse d'avant la pause, sauf si le joueur a lui-même changé la vitesse entre-temps, ou en cas de faillite ou de fin de partie. Les bilans et la célébration d'un titre arrêtent aussi l'horloge tant qu'ils sont ouverts.

> **Progression, étape 4** (2026-10-21, point ouvert n° 16) : l'accélération automatique passe à **×8** (`autoSpeed.speed` de `content/rythme.json`) et s'applique à **toute vitesse plus lente choisie par le joueur** (×1, ×2 ou ×4), plus seulement à ×1 : une journée calme dure 2,5 secondes. Les règles du calme ne changent pas (aucune décision proche, rien à l'agenda, 18 heures de jeu à la vitesse choisie après chaque nouvelle décision). La barre d'état affiche « accéléré ×8 ». Les vitesses que le joueur choisit restent pause, ×1, ×2 et ×4.

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
| Incidents et événements fâcheux | −50 % | −25 % | +20 % |
| Imprévus de chantier | −30 % | normal | +20 % |
| Rivaux | plus lents | normaux | plus vifs |
| Confiance des banquiers | monte plus vite | normale | monte plus lentement |
| Faillite | seulement des saisies | nouveau départ | fin de partie |
| Retours en arrière | illimités | 3 par partie | aucun |

> **Jalon 6** : table dans `content/modes.json`. Serein : imprévus et incidents ×0,7, rivaux ×0,75, gains de confiance ×1,3 ; Exigeant : ×1,2, ×1,25 et ×0,75. Les coefficients s'appliquent aux incidents des locataires, aux imprévus de chantier, aux événements « fâcheux » du catalogue, à l'agressivité des rivaux et aux seuls gains de confiance des banquiers (jamais aux pertes). « Seulement des saisies » en Serein : les ventes forcées ont lieu, mais la faillite devient un nouveau départ qui garde **toute** la réputation (choix de Thibaud).

> **Progression, étape 1** (2026-10-21, point ouvert n° 16) : les incidents des locataires et les événements « fâcheux » du catalogue deviennent moins fréquents (coefficient d'incidents de Serein 0,7 → 0,5, de Classique 1 → 0,75) ; Exigeant garde 1,2, soit son niveau d'avant. Les imprévus de chantier ne changent pas. L'épargne plus forte (chapitre 3.1) et les loyers +10 % (chapitre 3.4) valent pour les trois modes : Exigeant reste plus dur par ses autres coefficients.

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

Le joueur reste dans le **même monde** et redevient salarié dans son métier, à Dole, avec un petit apport de **5 000 €**.

Il **garde** : ses titres, ses succès, sa chronique, son carnet d'artisans et **50 %** de sa réputation.
Il **perd** : tous ses biens, ses crédits et sa trésorerie.

> **Jalon 6** (point ouvert n° 11, tranché) : 5 000 € et 50 % de la réputation en Classique, 100 % en Serein. Le joueur redevient locataire au loyer de départ ; ses achats en cours (compromis) et ses offres sont abandonnés, ses dettes fiscales effacées, et chaque banquier lui retire 20 points de confiance (10 en Serein). En mode Exigeant, la partie s'arrête (`gameOver`) : le temps ne passe plus, les actions sont refusées, la chronique et les statistiques restent consultables.

La partie n'est jamais perdue, mais la chute fait mal.

## 2.7 Le retour en arrière

- **Sauvegarde automatique le 1er de chaque mois**, en gardant les **6 derniers mois**.
- Écran « **Revenir en arrière** » : liste des points avec la date et le patrimoine net à cette date.
- Nombre de retours selon le mode : illimité (Serein), 3 par partie (Classique), aucun (Exigeant).
- Techniquement simple : l'état complet du jeu est sérialisable (voir [07-architecture.md](07-architecture.md)).

> **Jalon 6** : les points sont pris par l'application à la sauvegarde automatique du 1er de chaque mois et rangés dans l'emplacement de sauvegarde (`checkpoints`, date, patrimoine net et partie). Revenir en arrière (`engine.rewind`) reprend la partie du point, mais **garde le compteur de retours de la partie en cours** : remonter le temps ne rend jamais les retours déjà utilisés. Les points postérieurs sont effacés ; le retour s'inscrit dans la chronique.

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

> **Jalon 6** (point ouvert n° 5, valeurs de départ dans `content/progression.json`) : départ à 10. Gains : +3 par achat, +2 par revente avec plus-value, +1 par chantier terminé et +1 par classe DPE gagnée, +2 par année tranquille (des biens, ni vente forcée, ni procédure, ni expulsion, ni logement indécent loué), +1 par locataire satisfait (70 ou plus) au 1er janvier, la récompense des défis, et certains choix d'événements. Pertes : −8 par vente forcée, −4 par procédure, −2 par expulsion, −2 quand un locataire part à cause d'un incident laissé sans réparation, −5 par an et par logement indécent loué, en plus de la relance d'impayé du jalon 2. Effets : marge bancaire réduite de 0,05 point à 50, 0,10 à 70, 0,20 à 90 (ligne « Réputation et titres » du détail du taux) ; à partir de 30, un agent propose un bien hors marché environ une fois tous les 4 mois (motivation `offMarket`, 4 à 12 % sous la valeur, visible du seul joueur pendant 5 jours) ; la priorité chez les artisans existait déjà (file d'attente raccourcie avec la réputation, jalon 3). La notoriété locale par ville attend le jalon 7.

## 2.9 Les titres

Deux branches qui se rejoignent. Les seuils sont à calibrer.

| Étape | Branche Bailleur | Branche Marchand de biens |
|---|---|---|
| Départ | Locataire ambitieux | Locataire ambitieux |
| 1 | Primo-investisseur (premier bien) | Primo-investisseur (premier bien) |
| 2 | Bailleur (3 biens loués) | Rénovateur (3 rénovations terminées) |
| 3 | Investisseur aguerri (patrimoine net de 250 k€, 2 villes) | Marchand de biens (5 reventes avec plus-value) |
| 4 | Promoteur (division ou transformation d'un bien, jalon 8) | Promoteur |
| 5 | **Magnat** (patrimoine net de 1 M€, l'IFI approche) | **Magnat** |
| Ultime | **Baron de la pierre** (5 M€ net, 4 villes, réputation de 90) | **Baron de la pierre** |

Chaque titre apporte un **petit avantage** (une marge bancaire réduite, un agent de plus qui appelle) et une **scène de célébration** dans la rue.

> **Jalon 6** (`content/titres.json`) : chaque titre demande un titre de l'étape précédente de sa branche. Rénovateur : 3 chantiers d'au moins 10 000 € chacun. Bailleur : 3 biens loués en même temps. La condition des 2 villes (Investisseur aguerri) et des 4 villes (Baron) est écrite mais inactive jusqu'au jalon 7 ; Promoteur arrive au jalon 8, et Magnat suit donc directement Investisseur aguerri ou Marchand de biens. Avantages : −0,05 point de marge par titre de Primo-investisseur à Magnat ; Bailleur et Rénovateur ajoutent un agent qui propose des biens hors marché (+15 % de chance par mois), Investisseur aguerri, Marchand de biens et Magnat +10 % chacun. Un nouveau titre ouvre une scène de célébration (confettis, musique « célébration »).

> **Jalon 8** (décisions validées) :
> - **Investisseur aguerri** : 150 000 € nets (250 000 € auparavant, jamais atteint en 10 ans) et des biens dans 2 villes.
> - **Promoteur** est actif : une transformation terminée (division d'une maison, vente à la découpe d'un immeuble, combles, construction ; chapitre 3.5). Il suit Investisseur aguerri ou Marchand de biens.
> - **Magnat** : 1 000 000 € nets (1,3 M€ auparavant). Il suit **Investisseur aguerri, Marchand de biens ou Promoteur** : transformer un bien n'est pas obligatoire, Promoteur reste une voie parmi d'autres (mesure du jalon 8 : avec Promoteur pour seul prérequis, un Chasseur ne devenait jamais Magnat).
> - **Bailleur** ne compte que les logements loués (un parking ou un local ne fait pas un bailleur).

> **Plaisir de jeu, lot 5** : l'interface suggère le **prochain titre** : parmi les titres dont l'étape précédente est tenue, celui dont les conditions sont les plus avancées (moyenne des parts accomplies ; l'étape la plus basse à égalité), avec une jauge par condition (chapitre 4). Aucune règle de titre ne change.

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

> **Jalon 6** :
> - **44 succès** dans `content/succes.json`, décrits par des conditions sur des **statistiques** (compteurs tenus par le moteur, ou valeurs lues dans l'état : patrimoine, loyers, confiance d'un banquier…). « Mme Delaporte en larmes » compte les compromis signés sur une annonce qui intéressait Monique Delaporte. Un succès peut être secret (« Le phénix »).
> - **13 défis** dans `content/defis.json`, lancés par Gérard, Kévin, Hortense, Yvon, Monique ou les frères Martinot : à accepter dans les 5 jours, à réussir en 4 à 5 mois le plus souvent (12 mois pour la série de bilans positifs, la fin de l'année pour « Zéro impôt »), récompense de 4 à 6 points de réputation, petite pénalité pour certains. Un seul à la fois, puis 45 jours de répit : 2 à 3 par an. Kévin Boost propose pour l'instant un bien « avant quatre mois » à Dole ; Besançon viendra avec les villes.
> - **Chronique** : départ, premiers achat, bail, chantier et revente, résidence principale, titres, succès, défis, grands événements nationaux, vente forcée, faillite, nouveau départ, fin de partie, retour en arrière, record de plus-value.
> - **Statistiques** : le point mensuel de la courbe garde aussi les loyers en cours et la réputation ; courbes du patrimoine, des loyers, des dettes, du bilan mensuel et de la réputation ; records (patrimoine le plus haut, plus belle plus-value, plus beau chantier, meilleur mois) et compteurs.

> **Jalon 8, la réputation** (point ouvert n° 14, décision validée ; `content/progression.json`) : au-delà de **70**, chaque gain est multiplié par (100 − réputation) / 30 : à 85, un gain de 3 points n'en vaut plus que 1,5 ; les pertes ne changent pas. Au bilan annuel, une réputation au-dessus de **80** perd **5 points** (sans descendre sous 80 ; 2 points avant la mesure du jalon 8, qui laissait la réputation médiane à 95 en 25 ans) : rester au sommet demande de continuer à bien faire. La réputation peut avoir une décimale. Le seuil de 90 du Baron de la pierre reste inchangé.

> **Jalon 7** : la **notoriété locale** existe (`player.renown`, 0 à 100, zéro dans chaque ville, y compris Dole). Chaque gain ou perte de réputation causé par un bien déplace aussi la notoriété de sa ville du même montant. Elle augmente la chance d'une offre hors marché dans la ville et raccourcit la file d'attente de ses artisans (détail au chapitre 3.8). Les conditions de villes des titres sont **actives** : Investisseur aguerri demande des biens dans 2 villes, Baron de la pierre dans 4 ; la condition compte les villes où le joueur possède un bien.
