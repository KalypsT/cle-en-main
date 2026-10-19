# 3.6 Fiscalité

Objectif : **des choix fiscaux intéressants, sans paperasse.** Le joueur peut ignorer complètement la fiscalité : le jeu applique alors automatiquement le choix le plus avantageux.

> Les règles ci-dessous s'inspirent de la fiscalité française connue en octobre 2026, simplifiée. Elles changent souvent : **revérifiées au jalon 2** (voir l'encadré ci-dessous).

> **Réalisation au jalon 2** (`packages/engine/src/systems/taxes.ts`, valeurs dans `content/fiscalite.json`).
>
> **Règles en vigueur vérifiées en octobre 2026** (loi de finances pour 2026 du 19 février 2026, loi de financement de la Sécurité sociale pour 2026) :
>
> | Règle | Valeur retenue |
> |---|---|
> | Barème de l'impôt sur le revenu (revenus 2025, une part) | 0 % jusqu'à 11 600 €, 11 % jusqu'à 29 579 €, 30 % jusqu'à 84 577 €, 41 % jusqu'à 181 917 €, 45 % au-delà |
> | Prélèvements sociaux | 17,2 % sur les revenus fonciers (location nue) et les plus-values immobilières ; **18,6 %** sur les revenus de location meublée (LMNP), touchés par la hausse de la CSG de 2026 |
> | Micro-foncier | abattement de 30 %, recettes nues jusqu'à 15 000 € |
> | Micro-BIC (meublé de longue durée) | abattement de 50 % (305 € au moins), recettes jusqu'à 77 700 € (certaines sources donnent un plafond revalorisé à 83 600 € : sans effet à l'échelle du jeu) |
> | Déficit foncier | imputable sur le revenu global jusqu'à 10 700 € par an, hors intérêts d'emprunt ; le reste se reporte 10 ans sur les revenus fonciers. Le plafond doublé (21 400 €) pour une rénovation énergétique (logement classé E, F ou G porté en A à D, loué nu au réel) est prolongé jusqu'à fin 2027 par la loi de finances pour 2026 : modélisé au jalon 3 |
> | LMNP au réel | amortissement du bâti (85 % du coût d'acquisition sur 30 ans) et du mobilier (7 ans) ; l'amortissement ne peut pas créer de déficit, il se reporte ; depuis la loi de finances pour 2025, l'amortissement du bâti déduit est **réintégré dans la plus-value** |
> | Plus-value | 19 % + 17,2 % ; frais d'acquisition réels ou forfait de 7,5 % ; forfait travaux de 15 % après 5 ans ; abattements de 6 % par an de la 6e à la 21e année et 4 % la 22e (impôt), de 1,65 % par an de la 6e à la 21e, 1,60 % la 22e et 9 % par an de la 23e à la 30e (prélèvements sociaux) ; résidence principale exonérée |
>
> **Fonctionnement dans le jeu** :
> - Chaque bien tient un **livre de l'année** : loyers hors charges encaissés, charges déductibles (charges non récupérées, taxe foncière, assurances, honoraires d'agence, garantie loyers impayés, réparations, dégradations non couvertes, procédure) et intérêts d'emprunt.
> - Au **1er janvier**, le moteur calcule l'impôt de l'année écoulée et choisit, pour chaque bien laissé en « automatique », le régime le moins cher **comptable compris** (essai de toutes les combinaisons jusqu'à 10 biens). Le joueur peut imposer « simple » ou « réel » bien par bien (action `tax/setRegime`) ; un régime simple au-dessus du plafond de recettes passe au réel.
> - **Seul le surcroît d'impôt dû aux loyers est prélevé** : impôt(salaires + revenus locatifs − déficit imputable) − impôt(salaires), plus les prélèvements sociaux. Les salaires du jeu sont des nets après impôt ; le salaire imposable est le salaire versé dans l'année moins 10 % de frais professionnels. Un déficit foncier peut donc rendre ce surcroît **négatif** : c'est un remboursement.
> - L'impôt est payé en **12 mensualités** l'année suivante (ou remboursé de même). Les honoraires de **Yvon Tableur** (réel nu : 300 € pour le premier bien, 60 € par bien en plus ; LMNP : 550 € puis 120 €) sont payés au bilan et déduits du résultat.
> - **Taxe foncière** : prélevée le 15 octobre pour chaque bien possédé ce jour-là (résidence principale comprise), déductible sauf pour la résidence principale.
> - **Plus-value** : calculée à la vente (et aux ventes forcées), retenue par le notaire sur le prix ; le dépôt de garantie du locataire en place est remis à l'acheteur.
>
> **Travaux (jalon 3)** :
> - Les travaux payés (acomptes, factures, imprévus, matériaux, appels de fonds de la copropriété) vont dans le livre de l'année du bien. Au bilan : en **location nue au réel**, ils sont déduits et peuvent créer un **déficit foncier** ; l'année où une rénovation fait passer un bien de E, F ou G à A, B, C ou D (jusqu'en 2027), le plafond imputable sur le salaire passe à **21 400 €** ; en **LMNP au réel**, ils sont **amortis sur 15 ans** comme le bâti (et réintégrés de même dans la plus-value) ; sous un régime simple, pour un bien vide ou pour la résidence principale, ils ne sont pas déduits.
> - **Plus-value** : les travaux réels non déduits des loyers remplacent le forfait de 15 % quand ils sont plus élevés (et comptent même avant 5 ans de détention), comme le prévoit la règle réelle (des travaux déjà déduits ne peuvent pas compter deux fois).
> - Requête `estimateTaxes` : impôt de l'année en cours et coût de chaque régime pour chaque bien (le futur écran « d'où vient ce montant ? »).
>
> **Simplifications** (à connaître) :
> - une seule part fiscale, ni décote ni quotient familial ;
> - un régime **par bien** comme le prévoit ce chapitre, alors qu'en réalité le régime simple ou réel vaut pour tous les biens d'une même catégorie, et l'option pour le réel engage 3 ans (foncier) ;
> - les déficits LMNP restent attachés à leur bien et ne s'éteignent pas ; un bien vendu en cours d'année n'est pas amorti cette année-là ;
> - les abattements pour durée de détention s'appliquent à toute la plus-value, amortissements réintégrés compris (les sources divergent) ; pas de surtaxe des plus-values au-delà de 50 000 € ;
> - la taxe foncière n'est pas proratisée à l'achat ni à la vente, et n'augmente pas avec les années (le jeu n'a pas encore d'inflation générale) ;
> - les frais de dossier bancaires ne sont pas déduits au réel ; le mobilier n'est pas renouvelé ;
> - pas de prélèvement à la source en cours d'année ni de régularisation : l'impôt d'une année est payé l'année suivante ;
> - le **statut du bailleur privé** (« dispositif Jeanbrun », loi de finances pour 2026 : amortissement en location nue pour le neuf et l'ancien avec au moins 30 % de travaux, sous plafonds de loyer et engagement de 9 ans) n'est pas modélisé (décision du jalon 3 : trop de contraintes pour un gain de jeu limité) ;
> - travaux : pas de distinction entre entretien, amélioration et agrandissement (tout est déductible au réel nu) ; le plafond doublé s'applique à tout le déficit de l'année du chantier et non à la seule part des travaux énergétiques ; l'engagement de louer 3 ans n'est pas vérifié ; pour un bien vendu en cours d'année, les travaux de l'année comptent dans la plus-value sauf en location nue ; les matériaux des travaux faits soi-même comptent comme des factures ;
> - pas de taxe sur les logements vacants (Dole n'est pas en zone tendue), pas d'encadrement des loyers ; l'IFI arrive au jalon 8 (plus bas).

## L'impôt sur les revenus locatifs

- L'impôt dépend de la **tranche marginale d'imposition** du joueur, calculée à partir de son salaire et de ses revenus locatifs imposables (barème simplifié, une part fiscale), plus les **prélèvements sociaux** (17,2 %).
- **Un régime par bien et par an**, choisi au bilan annuel :

| Régime | Principe | Intérêt |
|---|---|---|
| **Location nue, régime simple** | 30 % des loyers exonérés d'office | Simple, bon quand il y a peu de charges |
| **Location nue, régime réel** | Déduction des intérêts d'emprunt, travaux, charges, taxe foncière, assurance, frais de gestion | Bon avec un crédit ou des travaux ; peut créer un **déficit foncier** |
| **Location meublée, régime simple** | 50 % des loyers exonérés d'office | Simple et souvent avantageux |
| **Location meublée, régime réel** | Déduction des charges et **amortissement** du bien et du mobilier | Efface souvent l'impôt ; l'amortissement est en partie **réintégré dans la plus-value** à la revente (règle de 2025) |

- **Le déficit foncier** : en location nue au régime réel, si les charges (hors intérêts) dépassent les loyers, l'excédent réduit l'impôt sur le salaire dans une limite annuelle (environ 10 700 €), le reste est reporté sur les années suivantes. Cela rend les gros travaux intéressants fiscalement.
- Le régime réel entraîne des **honoraires de comptable** annuels (voir plus bas), ce qui en fait un vrai arbitrage.

## Le calendrier et le paiement

- L'impôt de l'année est **calculé au bilan annuel** (début d'année de jeu).
- Il est **prélevé chaque mois de l'année suivante**, ce qui crée un décalage de trésorerie à anticiper.

## Les autres impôts

- **Taxe foncière** : chaque automne, selon la ville et la surface (valeurs locales indicatives par commune).
- **Impôt sur la plus-value** à la revente :
  - taux de 19 % plus 17,2 % de prélèvements sociaux sur la plus-value nette ;
  - il diminue avec la durée de détention, avec une exonération totale d'impôt sur le revenu après 22 ans et des prélèvements sociaux après 30 ans ;
  - la **résidence principale est exonérée**.
- **Impôt sur la fortune immobilière (IFI)** : au-delà de **1,3 M€ de patrimoine immobilier net**, barème simplifié. Un marqueur de fin de partie, avec humour (« Félicitations, vous êtes officiellement riche »).
- **Une société (SCI)** pour aller plus loin, au jalon 8 (régime à préciser à ce moment-là).

> **Jalon 8, la SCI** (point ouvert n° 9, tranché : impôt sur le revenu ; `content/sci.json`, `packages/engine/src/systems/company.ts`) :
> - Création une fois pour toutes (action `company/create`, 1 500 € de statuts, de greffe et d'annonce légale). Deux associés sont obligatoires : le joueur détient 99 parts et tante Odile une part, pour la forme (simplification : le patrimoine compte 100 %).
> - **Un seul bilan** : pas de compte séparé, les flux de la SCI passent sur le compte du joueur.
> - Un achat se fait **en nom propre ou via la SCI**, choisi sur le compromis avant toute demande de prêt (action `purchase/setHolder`). On n'apporte pas un bien déjà possédé à la SCI.
> - Elle **ne loue que nu** (le meublé, la colocation et la courte durée la feraient passer à l'impôt sur les sociétés) ; locaux commerciaux et parkings sont permis. On n'habite pas un bien de sa SCI.
> - Transparente : ses loyers sont des revenus fonciers du joueur, **toujours au régime réel** ; son comptable coûte 1 200 € par an et 150 € par bien en plus, dès la création ; la plus-value suit le régime des particuliers.
> - Ses prêts sont jugés « au différentiel » (chapitre 3.2).

> **Jalon 8, l'IFI** (`content/fiscalite.json`, `wealthTax`) : au 1er janvier, sur la valeur de tous les biens (en nom propre et dans la SCI), avec un abattement de 30 % sur la résidence principale, moins le capital restant dû des prêts. Rien sous 1,3 M€ ; au-delà, barème 2026 (0,5 % de 800 k€ à 1,3 M€, 0,7 % jusqu'à 2,57 M€, 1 % jusqu'à 5 M€, 1,25 % jusqu'à 10 M€, 1,5 % au-delà) et décote entre 1,3 et 1,4 M€ (17 500 € − 1,25 % du patrimoine). Il est payé avec l'impôt sur les loyers, en 12 mensualités l'année suivante, et apparaît au bilan annuel (« Félicitations, vous êtes officiellement riche »). Simplifications : pas de plafonnement, pas de dettes non liées aux biens.

> **Jalon 8, les nouveaux baux** : la colocation est imposée comme un meublé (BIC) ; la location courte durée aussi, avec le micro-BIC des meublés de tourisme non classés (30 % d'abattement, 15 000 € de recettes au plus) ; les baux commerciaux et de parking sont des revenus fonciers.

## À l'écran

- Pour chaque bien, le jeu affiche **l'impôt estimé selon chaque régime** et **recommande** le plus avantageux.
- **La recommandation est appliquée par défaut.** Le joueur peut la changer pour un bien s'il veut optimiser.
- Chaque montant d'impôt peut être **expliqué** en un écran (« d'où vient ce montant ? »).

## Le comptable : Yvon Tableur

- Expert-comptable fictif, grand amateur de colonnes bien alignées.
- Il écrit au **bilan annuel** avec ses conseils : « Votre studio de Chalon gagnerait à passer au réel, et vous à dormir un peu. »
- Ses **honoraires annuels** ne s'appliquent qu'aux biens au régime réel (valeur indicative : quelques centaines d'euros par an), comme dans la réalité.
- Il lance parfois un défi (« Zéro impôt sur vos loyers cette année ? »).
