# 3.4 Location

> **Réalisation au jalon 2** (`packages/engine/src/systems/renting.ts`, `leases.ts`, `tenants.ts` ; valeurs dans `content/location.json`, textes dans `content/textes/locataires.json`). La location provisoire du jalon 1c (locataire automatique, 30 % du loyer retenus forfaitairement) est remplacée par les règles de ce chapitre. Les précisions ci-dessous complètent le texte de conception là où il restait muet.
>
> - **Loyer de marché** : loyer au m² du quartier (`data/cities/`) × état × DPE (de +3 % en A à −6 % en G) × indice des prix (élasticité 0,5) × type de bail (+15 % en meublé). La carte des loyers donne des loyers **charges comprises** : le jeu en retire les charges récupérables pour obtenir le loyer hors charges. Le joueur choisit son loyer entre 80 % et 130 % du marché.
> - **Charges** : le propriétaire paie les charges de copropriété chaque mois ; le locataire en rembourse 70 % (charges récupérables) avec son loyer.
> - **Assurances** : assurance propriétaire non occupant (80 € plus 1,50 € par m² et par an) ; garantie loyers impayés en option, 3 % du loyer charges comprises, qui paie les loyers manqués et la procédure.
> - **Candidatures** : chance quotidienne de 20 % au loyer de marché, divisée par exp(5 × écart au marché) ; 5 en attente au plus ; chaque candidat attend 3 à 7 jours. Six profils (salarié, famille, jeune actif, étudiant, retraité, indépendant), pondérés selon le bail. La fiabilité cachée dépend du profil, du revenu rapporté au loyer (référence : 3 fois le loyer), du garant, du trait, de l'agence, d'un loyer au-dessus du marché (candidats plus fragiles) et d'un bruit caché.
> - **Gestion directe** : chaque visite de candidat coûte 45 min de temps libre (manquée sans temps libre), l'entrée dans les lieux 2 h, l'état des lieux de sortie 1 h 30 (reporté au lendemain s'il manque du temps), une relance 20 min. Le joueur choisit lui-même son locataire.
> - **Agences** : elles choisissent le candidat au meilleur dossier (avec une erreur de jugement propre à chacune) après quelques jours, gèrent les visites, les relances et les incidents (artisan appelé d'office). Immo Zen : 8 %, candidats plus fiables, artisan en 1 à 2 jours. Bonne Pioche : 5 %, 60 % de candidats en plus mais moins fiables, choix en 2 jours. Gestion Plus ou Moins : 6 %, jugement et artisans très variables (1 à 10 jours). Les honoraires portent sur le loyer charges comprises encaissé.
> - **Bail** : nu, 3 ans, dépôt d'un mois, préavis de 3 mois ; meublé, 1 an (9 mois non renouvelables pour un étudiant), dépôt de deux mois, préavis d'un mois. Renouvellement tacite à l'échéance, sauf si le DPE interdit un nouveau bail. Le dépôt de garantie est encaissé à l'entrée et rendu à la sortie, moins les dégradations et les impayés.
> - **Satisfaction** : elle tend chaque mois vers une cible (72, corrigée selon l'état du logement, −0,8 point par % de loyer au-dessus du marché) ; un incident la fait chuter, puis chaque jour sans réparation. Sous 60, le risque de préavis augmente (×2 à 40, ×3 à 20). Un incident laissé 21 jours sans réparation pousse le locataire à donner son préavis.
> - **Incidents** : chauffe-eau, fuite, chauffage, serrure, humidité, avec une chance mensuelle (plus forte dans un logement à rénover) ; le joueur répare lui-même s'il en a le temps (coût des pièces) ou appelle un artisan (plus cher, quelques jours). Les artisans détaillés arrivent au jalon 3.
> - **Révision annuelle** : à chaque anniversaire du bail, le loyer suit l'évolution du loyer de marché du quartier depuis la dernière révision, sans jamais baisser, plafonnée à 3,5 % par an (inspirée de l'IRL et de son plafond récent).
> - **Événements de vie** : 15 % par an et par locataire, à l'anniversaire du bail : naissance, diplôme, retraité fidèle (petits travaux), mutation (préavis d'un mois), installation en couple.
> - **Impayés** : chance mensuelle de 3,5 % × (1 − fiabilité). La relance part 10 jours après le premier impayé ; elle réussit avec une chance de 90 % × fiabilité, sinon le locataire cesse de payer. Après deux mois impayés, la procédure est engagée automatiquement (1 500 à 3 000 €, 12 à 20 mois), puis l'expulsion, hors trêve hivernale (du 1er novembre au 31 mars), coûte 5 points de réputation. Un locataire déjà sur le départ n'est pas poursuivi : son dépôt couvre ce qu'il peut.
> - **Dégradations** : à la sortie, chance de 50 % × (1 − fiabilité), 10 à 40 € par m², prises sur le dépôt.
> - **Relocation** : à la sortie, le logement est remis en location automatiquement aux mêmes conditions (loyer ramené dans la fourchette), sauf si la loi l'interdit.
> - **DPE** : les dates réelles sont dans `content/location.json` ; un avertissement est émis au 1er janvier pour les biens qui seront interdits à la relocation dans les 24 mois. La « demande du quartier » sur les candidatures n'est pas encore modélisée (les données ne la donnent pas).
> - **Résidence principale** : le joueur peut emménager dans un bien qu'il possède et qui n'est pas loué (fin du loyer du personnage, plus d'assurance propriétaire non occupant, plus-value exonérée), et en repartir pour redevenir locataire au loyer de départ. La vente de la résidence principale le fait redevenir locataire.

## Mettre en location

Deux types de bail dès le départ (colocation et location courte durée au jalon 8) :

| | Location nue | Location meublée |
|---|---|---|
| Durée du bail | 3 ans | 1 an (9 mois pour un étudiant) |
| Loyer | plus bas | plus élevé (environ +10 à 20 %) |
| Investissement | aucun | achat du mobilier |
| Rotation | faible, locataires stables | plus forte |
| Dépôt de garantie | 1 mois de loyer | 2 mois de loyer |
| Préavis du locataire | 3 mois (1 mois dans certains cas) | 1 mois |
| Fiscalité | voir [06-fiscalite.md](06-fiscalite.md) | voir [06-fiscalite.md](06-fiscalite.md) |

- **Fixer le loyer** : le jeu affiche une fourchette selon le quartier, la surface, l'état et le DPE. Plus le loyer est haut, plus la vacance dure et plus les candidats sont fragiles.
- Un logement **indécent** ou interdit (DPE trop faible, voir plus bas) ne peut pas être mis en location.

## Trouver un locataire

- Après la mise en ligne de l'annonce, **2 à 5 candidatures** arrivent sur quelques jours (selon la demande du quartier et le loyer).
- Chaque dossier indique : revenus, type de contrat, garant, situation, ancienneté souhaitée et **un trait de caractère** (« batteur de jazz, promet de jouer doucement »).
- La **fiabilité réelle** est en partie cachée : un bon dossier réduit le risque sans l'annuler.
- Une candidature attend une réponse quelques jours, puis le candidat part ailleurs.
- **Garantie loyers impayés** (option) : environ 3 % des loyers, couvre les impayés et les frais de procédure.

## Gérer soi-même ou déléguer

- **Soi-même** : visites, états des lieux et incidents consomment du temps libre.
- **Agence de gestion** : un pourcentage des loyers, et le temps est libéré. Presque indispensable pour les biens éloignés.

| Agence | Honoraires | Caractère |
|---|---|---|
| **Immo Zen** | 8 % | Réactive et fiable, chère |
| **Agence Bonne Pioche** | 5 % | Remplit vite les logements, mais avec des locataires moyens |
| **Gestion Plus ou Moins** | 6 % | Imprévisible, au nom bien choisi |

Les agences sont présentes dans chaque ville (même enseigne, qualité locale variable).

## La vie du bail

- **Loyer mensuel** encaissé le 1er (ou avec retard selon le locataire).
- **Satisfaction du locataire** (0 à 100), qui dépend de :
  - l'état du logement ;
  - la réactivité du propriétaire aux incidents ;
  - le loyer comparé au marché ;
  - les travaux faits en logement occupé (baisse temporaire).
- La satisfaction influence le **départ** (une satisfaction basse augmente le risque de préavis) et le **soin** apporté au logement.
- **Incidents** à la charge du propriétaire : chauffe-eau, fuite, chauffage, serrure, humidité. Plus la réaction est rapide (soi-même ou artisan), moins la satisfaction baisse.
- **Révision annuelle** du loyer selon un indice de référence simulé (inspiré de l'IRL).
- **Départ** : préavis, puis état des lieux de sortie, retenue éventuelle sur le dépôt de garantie selon les dégradations, puis relocation (vacance).

## Des locataires vivants, avec mesure

- Au plus **un événement de vie par an et par locataire**, par exemple :
  - une naissance : besoin d'un logement plus grand, départ probable ;
  - un étudiant diplômé : départ en fin d'année universitaire ;
  - un retraité fidèle : reste longtemps, demande de petits travaux ;
  - une mutation : préavis court.
- Ces événements influencent la satisfaction et le départ, sans aller plus loin (pas de vie sociale simulée).
- Les locataires ont un prénom, un nom, un portrait et leur trait de caractère.

## Les impayés

1. **Retard** : le loyer n'arrive pas à la date prévue.
2. **Relance** (soi-même ou par l'agence).
3. **Procédure** : longue (plusieurs mois de jeu) et coûteuse, avec expulsion possible en fin de procédure, hors trêve hivernale (du 1er novembre au 31 mars).

La garantie loyers impayés couvre les loyers et les frais. Un impayé mal géré fait baisser la réputation.

## Le DPE et la location

Calendrier réel de la loi Climat et résilience :

| Classe | Location interdite pour un nouveau bail |
|---|---|
| G | depuis 2025 |
| F | à partir de 2028 |
| E | à partir de 2034 |

- Un **bail en cours continue**, mais le bien ne peut pas être reloué (ni le bail renouvelé) sans travaux.
- Le jeu prévient à l'avance (« Votre T2 de Chalon ne pourra plus être loué après janvier 2028 »).

## La résidence principale

Voir [01-temps-et-personnage.md](01-temps-et-personnage.md#le-logement-du-personnage).
