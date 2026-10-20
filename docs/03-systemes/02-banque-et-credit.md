# 3.2 Banque et crédit

C'est le cœur de la difficulté : sans crédit, pas d'effet de levier ; trop de crédit, et c'est la faillite.

## Les banques

Banques fictives aux noms volontairement décalés, chacune avec un banquier attitré.

| Banque | Banquier | Politique |
|---|---|---|
| **La Tirelire Comtoise** | Gérard Prudhomme, 58 ans, cravate en laine | Prudente, mais fidèle et compréhensive en cas de coup dur. Guide du didacticiel. |
| **Crédit Fougueux** | Kévin Boost, « on va scaler ton patrimoine » | Souple avec les investisseurs, taux un peu plus élevés |
| **Banque Rigueur & Fils** | Hortense Rigueur, aucun sourire | Les meilleurs taux, mais un dossier irréprochable exigé |
| **Néobanque ZéroPapier** | Léo, un chatbot très enthousiaste | Réponse immédiate, aucune dérogation, aucune relation |

## La confiance du banquier

Une jauge de 0 à 100 par banque.

| Elle monte avec… | Elle baisse avec… |
|---|---|
| Mensualités payées à l'heure | Jours de découvert |
| Loyers réguliers sur le compte | Impayés de loyers non couverts |
| Réussites (revente avec plus-value, rénovation) | Endettement trop élevé |
| Ancienneté de la relation | Vente forcée |
| Réputation globale | Demandes de prêt refusées à répétition |

**Effets** : la marge de la banque sur le taux, le montant et la durée accordés, et surtout les **dérogations** au-delà de 35 % d'endettement (comme le permettent les règles réelles pour une part des dossiers). Néobanque ZéroPapier n'en accorde jamais.

**Les rendez-vous** (1 h de temps libre) font progresser la relation et permettent de négocier. Ils donnent lieu à de courts dialogues avec une touche d'humour, dont le ton dépend de la confiance.

## Les règles du crédit (simplifiées)

- Uniquement des **prêts amortissables à taux fixe**. L'assurance est incluse dans le taux affiché.
- **Taux d'endettement maximal : 35 %** (mensualités totales / revenus), sauf dérogation.
- **Durée maximale : 25 ans**, 27 ans si le projet comprend de gros travaux.
- **Revenus retenus** : salaire, plus **70 % des loyers** (comme le font les banques).
- **Apport minimal** : les frais de notaire (environ 7,5 % dans l'ancien, **jamais moins de 1 500 €** depuis le jalon 8 : émoluments minimums et formalités pèsent lourd sur un parking à 10 000 €) plus environ 1,5 % de frais de dossier et de garantie.
- **Le taux proposé** = taux de marché du moment + marge de la banque, ajustée selon la durée, le profil (métier, ancienneté, réputation) et la confiance.
- **Le taux de marché** évolue lentement par simulation, avec des cycles et de rares chocs (voir [07-evenements.md](07-evenements.md)). Valeur de départ : **3,65 % sur 20 ans hors assurance** (taux réels d'octobre 2026), plus **0,30 point d'assurance** dans le taux affiché.
- Un crédit peut financer **l'achat et les travaux** ensemble.

> **Jalon 3** : la demande de prêt d'un achat indique la part de travaux (`works`). Si elle fait au moins 10 % du projet, la durée peut aller jusqu'à 27 ans. À l'acte, cette part du prêt est mise de côté sur le bien (**enveloppe travaux**) et paie d'abord ses factures de travaux ; ce qui reste au bout de 24 mois rembourse le prêt par anticipation (la mensualité baisse, la durée reste). À la revente, le reste de l'enveloppe revient au joueur. Pas de prêt travaux seul pour un bien déjà possédé.

> **Jalon 8, le crédit de la SCI « au différentiel »** (`packages/engine/src/systems/banking.ts`, règles dans `content/sci.json`) : un prêt pour un achat via la SCI n'est pas jugé sur le taux d'endettement du joueur. Ses mensualités et ses loyers n'entrent pas dans ce taux, qui ne compte plus que les prêts et les loyers en nom propre. La banque vérifie :
> - les contrôles habituels de l'emprunteur (métier, confiance, compte non débiteur) ; la banque doit prêter aux sociétés (le chatbot ZéroPapier ne le fait pas) ;
> - l'apport : une part des frais de notaire et de dossier (`feesContributionShare`) et une part du prix (`extraContributionShare`) ; **valeurs retenues après mesure : 0 et 0**, la banque finance les frais (« prêt à 110 % ») quand le bien s'autofinance ;
> - la couverture : le loyer de marché du bien, tel que le joueur le connaît (ou, si le prêt finance des travaux, comme refait à l'état 4), multiplié par 80 %, doit couvrir la mensualité ; sinon une durée plus longue, puis un accord partiel ;
> - le plafond : les dettes de la SCI après le prêt ne dépassent pas 6 fois le patrimoine net du joueur.
> - Un resserrement du crédit (crise nationale, chapitre 3.7) baisse pour un temps le taux d'endettement maximal et la part du loyer comptée.

## La demande de prêt

1. Le joueur choisit le bien (sous compromis), le montant, la durée et la banque (ou plusieurs).
2. Le simulateur affiche la mensualité, le taux d'endettement après prêt, le coût total.
3. La banque répond sous quelques jours (immédiatement pour ZéroPapier) : accord, accord partiel, contre-proposition ou refus, avec une explication lisible.
4. L'obtention du prêt se fait dans le délai du compromis (voir [03-marche-et-annonces.md](03-marche-et-annonces.md)).

## La renégociation et le rachat de crédit

Mécanisme volontairement simple, en une seule étape :

- Quand le taux de marché passe nettement sous le taux d'un crédit en cours (seuil à calibrer, par exemple 0,7 point), une notification apparaît : « Votre crédit peut être renégocié ».
- Un seul écran affiche : ancienne et nouvelle mensualité, **frais** (un montant unique qui représente les pénalités de remboursement anticipé et les frais de dossier), gain total sur la durée restante.
- Le joueur accepte ou refuse, auprès de sa banque (renégociation) ou d'une concurrente (rachat).
- **Vente d'un bien** : son crédit est remboursé automatiquement sur le prix de vente, avec les mêmes frais.

## Le découvert

- Simple **solde négatif** sur le compte courant.
- **Agios** calculés chaque jour à un taux élevé (valeur indicative : 16 % par an).
- Chaque jour de découvert fait baisser la confiance du banquier.
- S'il dure, on entre dans la descente vers la faillite (voir [02-boucle-et-progression.md](../02-boucle-et-progression.md#26-la-faillite)).
- Pas de prêt relais ni de trésorerie d'urgence.

## Écran Banque (rappel)

Mes crédits (capital restant, taux, mensualité, fin), simulateur, fiches des banquiers avec leur confiance, demande de prêt, propositions de renégociation.
