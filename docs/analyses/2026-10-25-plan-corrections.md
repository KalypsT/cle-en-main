# Plan de corrections après l'analyse du 25 octobre 2026

Suite de [l'analyse de jouabilité](2026-10-25-analyse-jouabilite.md). Le plan traite les **bugs (B1 à B5)**, les **failles et incohérences (L1 à L6)** et les **écrans manquants**. Il laisse de côté, comme convenu, les fonctionnalités prévues non réalisées (enchères judiciaires, bot Aléatoire, jalon 9) et l'**équilibrage**, à revoir une fois ces corrections fusionnées (elles changent presque tous les chiffres des bots).

Cinq pull requests, à enchaîner dans l'ordre : chacune part de `main` après la fusion de la précédente. Les deux premières sont les plus urgentes ; les trois suivantes sont indépendantes entre elles.

| PR | Sujet | Contenu | Format de sauvegarde | Partie dorée |
|---|---|---|---|---|
| 1 | Règles du moteur | B2, B3, B4 (moteur), B5 (maître d'œuvre), L1, L2, L3 | v24 (date d'emménagement) | probablement modifiée (B3, L3) |
| 2 | Fiabilité de l'interface | B1, B4 (écran), B5 (journal, sauvegardes, demande de prêt), L6 | inchangé | inchangée |
| 3 | Transformations et ventes sans mauvaise surprise | L4, L5 | inchangé | à vérifier (prévision de trésorerie) |
| 4 | Banque et personnage | rendez-vous banquier, fiche du personnage, démission, reprise d'emploi | v25 (recherche d'emploi) | inchangée |
| 5 | Impôts, carnet et rivaux | impôt par régime, détail de l'impôt, Carnet, rivaux intéressés | inchangé | inchangée |

Pour chaque PR, comme le demande `CLAUDE.md` : tests Vitest de chaque règle touchée, `pnpm typecheck`, `pnpm lint`, `pnpm validate-content`, `pnpm test`, tests de bout en bout concernés ; textes et chiffres dans `content/` ; chapitre de `docs/` et journal de `docs/10-points-ouverts.md` mis à jour quand une règle change ; série courte de bots (100 parties de 10 ans) jointe à la PR quand une règle de jeu change.

---

## PR 1 : règles du moteur

Branche proposée : `corrections-regles-moteur`.

### L1. Habiter seulement un logement habitable

- `renting.ts`, `moveIntoHome` : refuser un bien qui n'est pas un logement (`isDwelling` : appartement, maison, immeuble), un logement indécent (`isIndecent`) ou en gros travaux (`heavyWorksInProgress`), avec trois nouveaux codes de refus (`home.notDwelling`, `home.indecent`, `home.works`) et leurs textes dans `content/textes/interface.json`.
- `PropertyScreen.tsx` : n'afficher « Habiter ici » que pour un logement ; pour un logement indécent ou en chantier, le bouton reste visible mais grisé, avec la raison.
- **Partie déjà en cours** : un joueur qui habite déjà un parking ou un terrain y reste (pas de déménagement forcé) ; la règle s'applique à la prochaine installation. À confirmer (décision D2).
- Tests : refus pour parking, terrain, local, logement indécent, chantier en cours ; acceptation pour un appartement décent.

### L2. Exonération de plus-value réservée à une vraie résidence principale

- Nouveau champ `player.homeSinceDay` (jour d'emménagement), rempli par `moveIntoHome`, remis à `null` par `moveOutOfHome` et par le nouveau départ. **Format v24** : migration qui met le jour de la partie pour un joueur déjà installé (il garde son exonération acquise), test de migration.
- `taxes.ts`, `capitalGainsTax` : exonération seulement si le bien est la résidence principale depuis au moins `capitalGains.homeMinMonths` mois (nouvelle valeur de `content/fiscalite.json`, décision D1) **à la date de l'accord de vente**.
- `moveIntoHome` : refuser d'emménager dans un bien mis en vente (`sale.listed`), ce qui ferme aussi le cas « j'emménage puis j'accepte l'offre ».
- Écran Vente : la ligne « Impôt sur la plus-value » dit pourquoi elle est nulle (« résidence principale depuis plus de n mois ») ou pourquoi elle ne l'est pas encore (« résidence principale depuis 3 mois sur 12 »).
- Tests : vente d'une résidence principale récente imposée, ancienne exonérée ; migration v23 → v24.

### L3. Les conditions de villes comptent des logements

- `progress.ts`, statistique `cities` : ne compter que les villes où le joueur possède un logement (`isDwelling`), comme `letProperties`.
- Vérifier que les titres déjà obtenus restent acquis (ils le sont : un titre n'est jamais retiré).
- Mettre à jour le chapitre 2.9 (Investisseur aguerri, Baron de la pierre).

### B3. Indemnités de remboursement anticipé à la vente

- `resale.ts`, `settlement` : remplacer `refinancingFees` par `earlyRepaymentFees(content, loan, loan.remaining)`. Touche aussi les ventes forcées (même chemin).
- Tests : la vente coûte les mêmes indemnités qu'un remboursement total depuis la Banque.

### B2. L'enveloppe travaux suit le crédit qui la porte

- `banking.ts`, `refinanceLoan` : reporter `worksFund.loanId` des biens concernés sur le nouveau crédit.
- Format : pas de changement de structure. Pour les parties en cours dont l'enveloppe pointe déjà vers un crédit archivé, une migration v24 la rattache au crédit actuel du même bien (même PR que L2, une seule version).
- Test : rachat avec une enveloppe en cours, puis fin de l'enveloppe : le restant dû baisse du reste de l'enveloppe.

### B4 (moteur). Pas de réponse de banque après la condition de prêt

- `purchases.ts`, `requestLoan` : refuser une demande dont la réponse tomberait après `loanDeadlineDay`, avec un code `purchase.answerTooLate` et le texte « Hortense Rigueur répond en 7 jours : trop tard pour la condition de prêt ».
- Test : demande au 9e jour chez Hortense Rigueur refusée, au 6e jour acceptée.

### B5 (moteur). Honoraires du maître d'œuvre

- `works.ts`, `delegateWorks` : vérifier que l'acompte **et** les honoraires tiennent dans ce qui est disponible (compte et enveloppe) avant de lancer, sinon `account.insufficientFunds`.

### Gestion à distance d'un bien vide (L6, règle)

- `cities.ts`, `isRemoteSelfManaged` : à trancher (décision D3). Proposition : pas de frais de gestion à distance pour un bien ni loué ni en location (vide, en chantier, en vente).

### Avant de pousser

- Relancer la partie dorée (`pnpm --filter @cle/engine exec vitest run -u`), expliquer le diff dans la PR (B3 et L3 sont les plus susceptibles de la modifier).
- Série de bots de 100 parties de 10 ans, jointe à la PR (L2 et B3 touchent le Marchand de biens ; L3 touche le Chasseur à Dijon).
- Docs : chapitres 2.9, 3.1 (logement), 3.3 (revente), 3.6 (plus-value), journal des décisions.

---

## PR 2 : fiabilité de l'interface

Branche proposée : `corrections-interface`.

### B1. Le temps repart après une pause automatique, même avec un bilan ouvert

- `GameShell.tsx` : à l'ouverture d'un bilan ou d'une scène, si la session est déjà en pause automatique, ne pas appeler `setSpeed(0)` (le jeu est déjà arrêté) et ne rien retenir.
- `game-session.ts` : ajouter une notion de « retenue » (le temps attend une scène) distincte de la vitesse choisie : `hold()` / `release()`. La reprise après la pause automatique n'a lieu qu'une fois toutes les décisions réglées **et** aucune scène ouverte ; la fermeture de la scène ne relance que si rien d'autre ne retient le temps.
- Tests de la session (Vitest) : assemblée et bilan le même jour, vote, fermeture du bilan dans les deux ordres, le temps repart à la vitesse d'avant. Un test de bout en bout : appartement en copropriété, mois de l'assemblée.

### B4 (écran). Délai de réponse des banques visible

- `PurchaseScreen.tsx`, fenêtre de demande : afficher le jour de réponse de la banque choisie à côté de la fin de la condition de prêt, et désactiver « Envoyer » avec l'explication quand la réponse arriverait trop tard (le moteur refuse de toute façon, PR 1).

### B5 (interface)

- `App.tsx` : écrire le journal de partie en attente avant un retour en arrière et en quittant la partie.
- `storage/saves.ts` : enchaîner les sauvegardes d'un même emplacement (une file de promesses) pour qu'une sauvegarde en arrière-plan n'efface pas le point de retour du 1er du mois.
- `PurchaseScreen.tsx`, demande de prêt : durée par défaut de 25 ans (comme le financement simulé) ; le montant saisi revient au montant proposé quand on change de banque, de durée ou de travaux.

### L6. Petites incohérences

- **Terrain dans « À décider »** : `pendingDecisions`, décision `vacant` seulement pour un bien qui se loue (`lettingBlock` différent de `rent.notLettable`).
- **Boutons de la fiche d'un bien** : « Faire des travaux » seulement si le catalogue de travaux n'est pas vide ; « Mettre en location » seulement si le bien se loue.
- **Offre au-dessus du prix** : dans la fenêtre d'offre, un montant supérieur au prix affiché demande une confirmation (« Vous proposez plus que le prix affiché ») ; au-delà de 1,5 fois le prix, le bouton est désactivé (faute de frappe probable).
- **Devis du même métier** : à l'écran de chantier, ne cocher par défaut que le devis le moins cher de chaque poste ; un poste en double se voit sur les deux lignes, avec le lancement désactivé tant qu'il en reste un.
- **Didacticiel** : quand l'achat suivi est annulé (prêt refusé, retrait, condition de prêt échue), revenir à l'étape « repérer une annonce » plutôt que de rester sur « acceptez l'offre de prêt ».

### Avant de pousser

- Tests Vitest de la session et de `pendingDecisions` ; tests de bout en bout touchés (`first-property`, `progression`, `feedback`).
- Pas de règle de jeu changée : pas de série de bots, partie dorée inchangée.

---

## PR 3 : transformations et ventes sans mauvaise surprise

Branche proposée : `transformations-ventes-sures`.

### L4. Transformations

- **Prévision de trésorerie** (`ui-queries.ts`, `cashForecast` et `statementOutlook` si concerné) : ajouter le solde d'une transformation en cours à sa date de fin, payé d'abord par l'enveloppe travaux. L'alerte de trésorerie le verra 30 jours avant.
- **Fiche du bien, carte « Transformer le bien »** : « Lancer » ouvre une fenêtre de confirmation avec l'acompte payé aujourd'hui, le **solde à payer à la fin** (date), la trésorerie après l'acompte, et un avertissement en rouge si le compte et l'enveloppe ne couvrent pas le solde (« il manquera 42 000 € le 3 mai 2027 ») ; les lots qui ne seraient pas louables et la première interdiction DPE (déjà calculés par `transformationEstimate`).
- Le moteur n'empêche pas de lancer sans le solde (le joueur peut compter sur ses loyers), il prévient.
- Tests : `cashForecast` avec une transformation, de bout en bout : la confirmation montre le solde.

### L5. Ventes à perte

- **Écran Vente** : si le « reste sur le compte » est négatif, une carte rouge le dit avant la mise en vente et avant d'accepter une offre (« Il vous faudra 18 400 € pour solder le crédit »), avec le solde du compte à côté. Accepter une offre dans ce cas demande une confirmation.
- Cas des lots issus d'une division ou d'une découpe : la ligne « Crédit remboursé » précise « tout le crédit de l'immeuble » quand le lot porte le prêt d'origine.
- Tests de bout en bout : vente d'un bien dont le crédit dépasse le prix.

### Avant de pousser

- Pas de règle de jeu changée. Si la prévision de trésorerie entre dans une statistique des bots (alerte), vérifier la partie dorée.

---

## PR 4 : banque et personnage

Branche proposée : `banquier-et-personnage`.

### Rendez-vous avec un banquier

- **Fiche du banquier** (`BankerScreen.tsx`) : bouton « Prendre rendez-vous (1 h) » ; il dit quand le prochain rendez-vous est possible (30 jours après le dernier), ou qu'il sera planifié dans l'agenda faute de temps libre ; rien pour Léo (chatbot), qui garde son texte d'humour.
- **Banque** : sur chaque ligne de « Vos banquiers », un raccourci vers ce bouton.
- **Petits dialogues** (chapitre 3.2, « dont le ton dépend de la confiance ») : trois répliques par banquier selon la confiance (basse, moyenne, haute) dans `content/banques.json`, montrées dans la bonne nouvelle « Rendez-vous terminé » avec le portrait du banquier. À valider (décision D5) ; sinon un simple message avec la nouvelle confiance.
- Le texte `game.meetBanker` resservira ; supprimer `game.situationHeading`, `game.marketRate`, `game.latestEvent` s'ils restent inutilisés.
- Test de bout en bout : rendez-vous, confiance qui monte, refus avant 30 jours.

### Fiche du personnage, démission et reprise d'emploi

- **Écran « Moi »** (nouvelle entrée en tête du Menu) : nom et avatar, métier et salaire (ou « sans emploi »), temps libre d'un jour ordinaire, épargne de salaire du mois, logement (locataire à tel loyer, ou propriétaire de tel bien), ville de base, réputation et titre. Ce qui existe déjà ailleurs y est seulement repris.
- **Démissionner** : bouton avec confirmation qui rappelle les effets (8 h de temps libre par jour, plus de salaire, les banques ne retiennent que 70 % des loyers et exigent 24 mois de loyers encaissés).
- **Reprendre un emploi** (chapitre 3.1, « avec un délai de recherche ») : nouvelle action `job/seek` ; le joueur retrouve son métier d'origine après `jobSearchDays` jours (contenu, décision D4), pendant lesquels il garde le temps libre d'un sans-emploi ; confiance des banquiers inchangée. Nouveau champ `player.jobSearchEndDay` : **format v25** et migration (`null`), test.
- Tests moteur (démission, recherche, retour du salaire), test de bout en bout du parcours.

### Avant de pousser

- Les bots ne démissionnent pas : pas d'effet sur les séries. La reprise d'emploi est une règle nouvelle : chapitre 3.1 et journal.

---

## PR 5 : impôts, carnet et rivaux

Branche proposée : `impots-carnet-rivaux`.

### Impôt estimé selon chaque régime

- **Fiche du bien, onglet Finances** : sous le choix du régime, l'impôt de l'année en cours estimé en simple et au réel (comptable compris), avec la recommandation (requête `estimateTaxes`, déjà utilisée par les bots). Rien pour la résidence principale ni pour un bien de la SCI (toujours au réel, dit en une phrase).

### D'où vient cet impôt ?

- **Bilan annuel** : le montant « Impôt sur les loyers » s'ouvre (le « ? » habituel) sur le détail de `lastAssessment` : pour chaque bien, régime et résultat imposable ; puis déficit imputé sur le salaire, impôt sur le revenu en plus, prélèvements sociaux, comptable, IFI.

### Carnet

- **Entrée du Menu « Carnet »** (le texte `menu.contacts` existe), quatre sections :
  - **Artisans** par ville : métier, prix, fiabilité, chantiers faits ensemble, remise de fidélité, et combien de chantiers restent avant de connaître de nouveaux artisans ;
  - **Agences** : honoraires, caractère, biens gérés par chacune ;
  - **Banquiers** : confiance et dernier rendez-vous (renvoie à la fiche du banquier) ;
  - **Comptables et rivaux** : Yvon Tableur et ses honoraires de l'année ; chaque rival actif avec sa personnalité, ses quartiers, les biens qu'il vous a pris et ceux que vous lui avez pris (compteurs déjà tenus), la SCI Horizon seulement une fois arrivée.
- Le texte `menu.taxes` (« Impôts ») : à supprimer, l'impôt étant détaillé dans le bilan annuel et sur la fiche du bien.

### Rivaux intéressés sur une annonce

- **Fiche d'annonce** : une ligne « Monique Delaporte s'intéresse à ce quartier » quand un rival actif a de l'intérêt pour le bien (`interest > 0`) ; jamais son estimation ni son seuil, qui restent cachés. Nouvelle requête du moteur, sans effet sur la partie.

### Avant de pousser

- Pas de règle de jeu changée. Tests Vitest des nouvelles requêtes, tests de bout en bout du Carnet et de la fiche du bien.

---

## Décisions à valider avant de commencer

| # | Question | Proposition |
|---|---|---|
| D1 | Durée minimale pour l'exonération de plus-value de la résidence principale | 12 mois d'occupation à la date de l'accord de vente (`capitalGains.homeMinMonths`) |
| D2 | Un joueur qui habite déjà un parking ou un terrain dans une partie en cours | Il y reste ; la règle vaut pour la prochaine installation |
| D3 | Frais de gestion à distance d'un bien vide, en chantier ou en vente | Supprimés : le frais ne vaut que pour un bien loué ou en location |
| D4 | Délai pour retrouver un emploi après une démission | 60 jours, même métier, même salaire |
| D5 | Petits dialogues des rendez-vous bancaires | Trois répliques par banquier selon la confiance, dans `content/banques.json` |

## Après ces cinq PR

Relancer une série complète (100 parties de 10 ans par bot, puis 300 parties de 25 ans pour le Chasseur et le Promoteur) et reprendre l'équilibrage : densité de décisions, faillites du Levier, Promoteur trop rapide, Marchand de biens trop faible, réputation qui plafonne.

## Suivi

### PR 1 : série de bots (100 parties de 10 ans, mêmes graines que l'analyse)

Rapport : [2026-10-25-rapport-bots-pr1.md](2026-10-25-rapport-bots-pr1.md). Les écarts viennent surtout des indemnités à la vente (B3), plus basses, et de la fin des frais de gestion à distance sur les biens vides ; les bots n'emménageaient jamais dans leurs biens, L1 et L2 ne les touchent pas.

| Bot | Avant (médiane à 10 ans) | Après | Remarque |
|---|---|---|---|
| Prudent | 130,0 k€ | 130,0 k€ | inchangé (ne revend pas) |
| Chasseur | 172,2 k€, faillites 2 % | 172,2 k€, faillites 1 % | 1er décile de 91 à 104 k€ |
| Chasseur à Dijon | 166,0 k€, Investisseur aguerri 33 % | 171,2 k€, 32 % | L3 ne change rien : il achète des logements |
| Marchand de biens | 62,6 k€, 18 723 € d'impôt sur les plus-values | 64,7 k€, 17 486 € | indemnités de vente plus basses |
| Levier maximal | 71,8 k€, faillites 20 % | 77,9 k€, faillites 13 % | ventes forcées moins chères : encore plus loin de la cible (plus de 40 %), à reprendre avec l'équilibrage |
| Promoteur | 228,2 k€ | 216,1 k€ | dans le bruit d'une série de 100 parties |

### État au 25 octobre 2026

Les cinq étapes sont faites sur la branche `claude/game-complete-analysis-q96jg6`, pour une seule pull request : décisions D1 à D5 prises comme proposé. Restent, hors de ce plan, les fonctionnalités prévues non réalisées (enchères judiciaires, bot Aléatoire, jalon 9) et l'équilibrage (série complète à relancer).
