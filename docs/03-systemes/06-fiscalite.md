# 3.6 Fiscalité

Objectif : **des choix fiscaux intéressants, sans paperasse.** Le joueur peut ignorer complètement la fiscalité : le jeu applique alors automatiquement le choix le plus avantageux.

> Les règles ci-dessous s'inspirent de la fiscalité française connue en octobre 2026, simplifiée. Elles changent souvent : **à revérifier au moment de coder le jalon 2**.

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

## À l'écran

- Pour chaque bien, le jeu affiche **l'impôt estimé selon chaque régime** et **recommande** le plus avantageux.
- **La recommandation est appliquée par défaut.** Le joueur peut la changer pour un bien s'il veut optimiser.
- Chaque montant d'impôt peut être **expliqué** en un écran (« d'où vient ce montant ? »).

## Le comptable : Yvon Tableur

- Expert-comptable fictif, grand amateur de colonnes bien alignées.
- Il écrit au **bilan annuel** avec ses conseils : « Votre studio de Chalon gagnerait à passer au réel, et vous à dormir un peu. »
- Ses **honoraires annuels** ne s'appliquent qu'aux biens au régime réel (valeur indicative : quelques centaines d'euros par an), comme dans la réalité.
- Il lance parfois un défi (« Zéro impôt sur vos loyers cette année ? »).
