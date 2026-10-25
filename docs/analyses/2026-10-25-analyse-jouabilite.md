# Analyse de jouabilité du 25 octobre 2026

Revue complète du jeu à l'état de `main` (après la PR 32, jalon 8 et plans « Progression » et « Plaisir de jeu » terminés) : bugs, logique, écrans manquants, fonctionnalités prévues non réalisées, équilibrage.

> Ce document est un **constat**, pas une décision : rien n'a été modifié dans le code ni dans le contenu. Les numéros de ligne renvoient au commit `82b670e`.

## 1. Méthode

| Vérification | Résultat |
|---|---|
| `pnpm typecheck` | OK |
| `pnpm lint` (ESLint + Prettier) | OK |
| `pnpm validate-content` | OK, 45 fichiers |
| `pnpm test` | OK, 334 tests (moteur 310, contenu 5, données 8, bots 8, session 3) |
| Lecture du code | moteur (achats, offres, annonces, banque, location, baux, travaux, transformations, fiscalité, détresse, agenda, copropriété, rivaux, progression, requêtes de l'interface), session de jeu, sauvegardes, coquille de l'interface et écrans principaux |
| Joueur aléatoire (écrit pour l'analyse, hors dépôt) | 95 parties de 3 à 7 ans (près de 600 années de jeu, plus de 400 000 actions tentées), actions au hasard chaque jour, une partie sur deux avec 300 000 € de départ pour atteindre chantiers, ventes, SCI et transformations, toutes les requêtes de l'interface appelées, invariants vérifiés (pas d'exception, pas de `NaN`, sauvegarde relue à l'identique, aucun crédit orphelin, solde entier, réputation entre 0 et 100) |
| Scripts ciblés | un script par anomalie suspectée, pour la confirmer sur le moteur réel |
| Bots | `pnpm bots:series --games 100 --years 10` (11 bots), voir section 7 |

**Bonne nouvelle d'abord** : le moteur est solide. Le joueur aléatoire n'a provoqué **aucune exception, aucune valeur non finie, aucun état incohérent** et la sauvegarde se relit toujours à l'identique (seul l'ordre des clés change, sans effet). Les anomalies ci-dessous sont des règles mal raccordées ou des oublis d'interface, pas des plantages.

## 2. Bugs

### B1. Le temps ne repart pas après une assemblée de copropriété (ou toute pause automatique arrivée le 1er du mois)

- **Où** : `apps/game/src/game/GameShell.tsx` (écouteur des scènes, vers la ligne 255) et `apps/game/src/session/game-session.ts` (`setSpeed`, `resume`).
- **Ce qui se passe** : une décision qui met le jeu en pause et un bilan mensuel arrivent dans le même pas de temps. La session met d'abord le jeu en pause et retient la vitesse d'avant (`resume`). Puis la coquille, qui ouvre le bilan, lit la vitesse (déjà 0) et appelle `setSpeed(0)`, ce qui **efface** la vitesse retenue. Une fois le bilan fermé et la décision réglée, le temps reste en pause.
- **Fréquence** : systématique pour les assemblées générales, convoquées le 1er du mois de l'immeuble (`copro.ts`, `runDailyCopro`) : une fois par an et par appartement. Possible aussi pour une contre-offre, une offre d'acheteur, un imprévu ou un défi tombant le 1er.
- **Écart avec la doc** : chapitre 2.3, « une fois réglées toutes les décisions qui ont mis le jeu en pause, le temps repart à la vitesse d'avant la pause ».
- **Gravité** : faible (il suffit de relancer le temps), mais visible chaque année.

### B2. L'enveloppe travaux est versée sur le compte après une renégociation ou un rachat de prêt

- **Où** : `packages/engine/src/systems/banking.ts` (`refinanceLoan` crée un crédit avec un nouvel identifiant) et `works.ts` (`expireWorksFund` cherche le crédit par `worksFund.loanId`).
- **Ce qui se passe** : après un rachat, `worksFund.loanId` désigne l'ancien crédit, archivé. À l'échéance des 24 mois, le reste de l'enveloppe ne rembourse pas le prêt : il est **versé sur le compte courant**.
- **Confirmé par script** : achat avec 20 000 € de travaux dans le prêt, rachat par Hortense Rigueur 30 jours après l'acte ; deux ans plus tard, le crédit n'a baissé que de son amortissement normal et les 20 000 € sont sur le compte.
- **Conséquence** : un moyen d'emprunter de l'argent libre (« travaux » jamais faits, puis rachat du prêt).

### B3. La vente d'un bien coûte des indemnités trop élevées

- **Où** : `packages/engine/src/systems/resale.ts`, `settlement` (utilise `refinancingFees`).
- **Ce qui se passe** : le crédit d'un bien vendu est soldé avec les **frais de renégociation** (3 % du restant dû + 1 000 €) au lieu des **indemnités de remboursement anticipé** du chapitre 3.2 (le plus petit de 3 % et de 6 mois d'intérêts).
- **Confirmé par script** : crédit de 90 657 € à 4,24 % : 3 720 € de frais à la vente, contre 1 922 € si le joueur rembourse d'abord le prêt depuis la Banque.
- **Écart avec la doc** : chapitre 3.3, « avec les mêmes frais qu'un remboursement anticipé (chapitre 3.2) ». La règle des indemnités est arrivée après celle de la vente, qui n'a pas suivi. Touche aussi les ventes forcées.

### B4. Une demande de prêt peut recevoir sa réponse après la fin de la condition de prêt

- **Où** : `purchases.ts` (`requestLoan` n'empêche pas une réponse tardive ; `runDailyPurchases` annule l'achat à l'échéance) et `PurchaseScreen.tsx`.
- **Ce qui se passe** : Hortense Rigueur répond en 7 jours, le délai du compromis est de 14 jours. Une demande faite à partir du 8e jour est acceptée, puis l'achat est **annulé** (« pas de prêt ») avant la réponse. Le dépôt est rendu mais le bien est perdu, sans avertissement à la demande.
- **Confirmé par script** : demande au 9e jour, réponse prévue au 17e, achat annulé au 14e.

### B5. Bugs mineurs

- **Journal de partie** : les lignes en attente ne sont pas écrites quand on revient en arrière ou qu'on quitte la partie (`App.tsx`, `rewind` et `quit` n'appellent pas `flush`).
- **Sauvegardes concurrentes** : `saveToSlot` lit puis réécrit l'emplacement ; une sauvegarde à la mise en arrière-plan qui croise la sauvegarde du 1er peut effacer le point de retour du mois (rare).
- **Demande de prêt** (`PurchaseScreen.tsx`, `LoanRequestSheet`) : durée par défaut de 20 ans alors que le financement simulé et le cash-flow prévu sont sur 25 ans ; le montant saisi à la main n'est pas recalculé quand on change de banque ou de durée.
- **Maître d'œuvre** (`works.ts`, `delegateWorks`) : ses honoraires sont prélevés sans vérifier la trésorerie (découvert possible).

## 3. Problèmes de logique et failles

### L1. On peut habiter un parking, un terrain ou un local commercial

- **Où** : `renting.ts`, `moveIntoHome` (aucun contrôle du type de bien ni de la décence) ; `PropertyScreen.tsx` affiche « Habiter ici » pour tous les biens.
- **Confirmé par script** : parking de 12 000 € payé comptant, « Habiter ici » accepté, loyer du joueur de 520 € à 0 €. Le joueur aléatoire l'a fait dans plusieurs parties (parking et local commercial).
- **Conséquence** : 6 240 € par an d'économie pour un investissement de 13 500 €, sans assurance propriétaire ; c'est la meilleure affaire du jeu. Même chose avec un logement indécent ou en plein chantier.

### L2. Exonération de plus-value en emménageant juste avant la vente

- **Où** : `taxes.ts` (`capitalGainsTax` regarde seulement si le bien est la résidence principale le jour de l'acte) et `moveIntoHome` (possible sur un bien mis en vente tant qu'aucune offre n'est acceptée).
- **Confirmé par script** : appartement acheté 26 000 €, revendu 36 400 € : 3 059 € d'impôt, **0 €** après « Habiter ici ». Emménager est instantané, gratuit et sans durée minimale.
- **Conséquence** : la stratégie Marchand de biens n'a plus d'impôt à payer (36 % de la plus-value avant 5 ans d'ordinaire).

### L3. La condition « villes » des titres compte n'importe quel bien

- **Où** : `progress.ts`, statistique `cities`.
- Un parking d'environ 8 000 € à Dijon suffit pour la condition des 2 villes d'Investisseur aguerri (et 3 parkings pour les 4 villes du Baron). Le titre Bailleur exclut déjà parkings et locaux ; la condition des villes ne le fait pas. Le critère du jalon 7 (« une expansion à Dijon est viable mais demande un vrai effort ») est contournable.

### L4. Une transformation peut ruiner le joueur sans prévenir

- **Où** : `PropertyScreen.tsx` (`Transformations`), `transformations.ts`, `ui-queries.ts` (`cashForecast`).
- « Lancer » part **sans confirmation**. On paie 30 % d'acompte, puis le **solde à la fin** (jusqu'à 100 000 € et plus pour une division ou une construction), payable comptant pour un bien déjà possédé (pas de prêt travaux seul). Ce solde n'entre pas dans la prévision de trésorerie, donc pas d'alerte avant le découvert, puis la vente forcée au bout de 90 jours. L'estimation calculée par le moteur (lots qui ne seraient pas louables, première interdiction DPE) n'est pas affichée.

### L5. Vente à perte sans avertissement

- **Où** : `SaleScreen.tsx`.
- Le « reste sur le compte » peut être négatif (crédit supérieur au prix) sans alerte. Cas typique : après une division ou une vente à la découpe, **tout le prêt suit le premier lot** (règle documentée au chapitre 3.5) ; vendre ce lot rembourse tout le crédit de l'immeuble et met le compte en découvert.

### L6. Petites incohérences

- **Décisions** : un terrain, qui ne se loue pas, reste à jamais dans « À décider » avec « Logement vide : à louer, à rénover ou à vendre » (`pendingDecisions`, `vacant`).
- **Fiche d'un bien** : « Faire des travaux » s'affiche pour un parking, un terrain ou un local (écran vide).
- **Offre** : le champ accepte un montant au-dessus du prix affiché et le vendeur l'accepte (une faute de frappe de « 850 000 » au lieu de « 85 000 » signe un compromis à ce prix ; on peut se retirer pendant la condition de prêt).
- **Chantier** : deux devis du même métier (pour comparer) sont cochés tous les deux par défaut, et le lancement est refusé (« poste en double ») jusqu'à ce qu'on en décoche un.
- **Didacticiel** : si le prêt est refusé ou l'achat annulé, l'étape « Acceptez l'offre de prêt » reste affichée (on peut la passer).
- **Gestion à distance** : les frais mensuels courent aussi sur un bien vide ou en travaux, pas seulement sur un bien loué.

## 4. Écrans manquants (fonction en place, sans moyen de l'utiliser)

| Fonction du moteur | État | Effet |
|---|---|---|
| **Rendez-vous avec un banquier** (`bank/meet`, 1 h, +3 de confiance par mois) | Le bouton existait au jalon 1a et a disparu au jalon 4 (le texte `game.meetBanker` est resté). Ni la Banque ni la fiche du banquier ne le proposent. | La confiance ne monte plus que d'environ 0,7 point par mois : la dérogation au-delà de 35 % d'endettement (70 de confiance chez La Tirelire, 85 chez Hortense Rigueur) arrive bien plus tard et la marge reste haute. **Les bots, eux, prennent rendez-vous chaque mois** : l'équilibrage mesuré est plus favorable que ce que vit le joueur. |
| **Démissionner** (`job/resign`) | Aucun écran (la « fiche du personnage » du chapitre 3.1 n'existe pas). | Fonction invisible. Le moteur ne permet pas non plus de **reprendre un emploi** (prévu au chapitre 3.1) : une démission serait définitive. |
| **Impôt estimé selon chaque régime** (requête `estimateTaxes`) | Non utilisée. La fiche du bien n'a qu'une liste « Automatique / Simple / Réel ». | Le chapitre 6 prévoit « pour chaque bien, l'impôt estimé selon chaque régime » et le chapitre 4.6 « d'où vient cet impôt ? ». Le bilan annuel montre seulement le total et le conseil d'Yvon. |
| **Carnet** (artisans, agences, banquiers, comptable, rivaux) | Entrée de menu prévue (chapitre 4.4), textes `menu.contacts` et `menu.taxes` présents, aucun écran. | Les banquiers sont dans la Banque, les artisans seulement dans l'écran de chantier ; rien sur les rivaux ni sur les agences hors location. |
| **Rivaux intéressés** sur la fiche d'une annonce | Prévu (chapitre 4.5), absent. | On apprend l'intérêt d'un rival seulement quand il a acheté. |

Toutes les autres actions du moteur sont accessibles depuis un écran, et chaque sorte de décision ouvre un écran.

## 5. Fonctionnalités prévues non réalisées

| Fonctionnalité | Prévu où | État |
|---|---|---|
| **Enchères judiciaires** (et l'écran « Enchère en direct », la pause automatique pour une enchère, les Martinot qui font monter les prix) | 3.3, 3.7, 4.5, 2.3 | Rien dans le moteur ni dans l'interface. Seule une anecdote y fait allusion. |
| **Bot Aléatoire** (« rien ne plante, aucun état incohérent ») | 8.2 | Absent. Le joueur aléatoire écrit pour cette analyse peut servir de base. |
| **Reprendre un emploi** après une démission | 3.1 | Absent du moteur. |
| **Jalon 9** : équilibrage final, performances, accessibilité, nouvelles villes de France, **Paris en mode défi** | 9 | Non commencé (attendu). |
| **Musique** | 5.8, point ouvert 7 | Emplacements prêts, aucun morceau (à fournir par Thibaud). |
| **Titre définitif** du jeu | point ouvert 10 | Toujours « Clé en main ! ». |
| Relecture des quartiers et rues de Dijon, Besançon, Chalon | point ouvert 12 | À faire par Thibaud. |
| Confier des postes au maître d'œuvre depuis l'écran de chantier | 4.5 (jalon 8, « plus tard ») | **Fait** (bouton du maître d'œuvre dans le chantier). |

Le reste des jalons 0 à 8 est en place : villes, déplacements, notoriété, SCI, IFI, locaux, parkings, terrains, colocation, location courte durée, maître d'œuvre, division, combles, construction, SCI Horizon, crises, 120 événements, 54 anecdotes, 44 succès, 13 défis, 9 titres, rue vivante, coupe, carte, bilans, retour en arrière, export et import.

## 6. Robustesse

- Aucun plantage, aucune valeur non finie ni état incohérent en 95 parties aléatoires (plus de 400 000 actions tentées), y compris faillites en chaîne, nouveaux départs, ventes, chantiers, SCI, refinancements et transformations.
- Le moteur refuse proprement les actions impossibles (codes de refus tous traduits dans `content/textes/interface.json`).
- Le jeu aléatoire fait faillite très souvent : c'est attendu (achats au hasard), et la descente vers la faillite se déroule comme prévu (découvert, ventes forcées, nouveau départ ou fin de partie).

## 7. Équilibrage

SERIES_PLACEHOLDER

## 8. Priorités proposées

1. **L1** et **L2** (habiter un parking, plus-value effacée) : les deux failles changent la meilleure stratégie du jeu. Correctif simple : n'autoriser « Habiter ici » que pour un logement décent (appartement, maison), et exiger une durée d'occupation (ou refuser d'emménager dans un bien en vente).
2. **Rendez-vous banquier** : remettre le bouton (Banque et fiche du banquier) ; c'est aussi ce que font les bots.
3. **B1** (le temps ne repart pas après l'assemblée) : dans la coquille, ne pas appeler `setSpeed(0)` si le jeu est déjà en pause automatique, et reprendre la vitesse retenue par la session.
4. **B3** (indemnités à la vente) : utiliser `earlyRepaymentFees` dans `settlement`, puis relancer la graine dorée et les bots.
5. **B2** (enveloppe travaux après rachat) : reporter `worksFund.loanId` sur le nouveau crédit dans `refinanceLoan`.
6. **L4** et **L5** : confirmation et solde à prévoir pour une transformation, solde de la transformation dans la prévision de trésorerie, alerte si une vente laisse le compte négatif.
7. **B4** : refuser (ou avertir) une demande de prêt dont la réponse tomberait après la condition de prêt.
8. **L3** : ne compter que les logements dans la condition des villes.
9. Écrans : impôt par régime sur la fiche du bien, démission (si on la garde), Carnet.
