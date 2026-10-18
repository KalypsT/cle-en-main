# 9. Feuille de route

Le jeu se construit en **jalons jouables**, moteur d'abord, rendu ensuite. Chaque jalon se termine par un critère vérifiable.

| Jalon | Contenu | Terminé quand… |
|---|---|---|
| **0 – Fondations** | Repo pnpm, CI, déploiement Pages, PWA, horloge, hasard à graine, sauvegarde versionnée, validation du contenu | Une appli vide s'installe sur téléphone, et les tests et le déploiement passent automatiquement |
| **1 – Noyau économique** | Personnage et métiers, banques et crédit, scripts de données pour Dole, marché et annonces, offre, compromis, acte, revente, rivaux simples, lanceur de bots en ligne de commande | Les bots Prudent, Levier, Naïf et Inactif jouent 1 000 parties de 10 ans en ligne de commande, avec des résultats proches des cibles |
| **2 – Location et fiscalité** | Baux nus et meublés, candidatures, agences, incidents, impayés, DPE et calendrier, résidence principale, impôts, régimes, taxe foncière, plus-value | Le cash-flow d'un bien correspond à un calcul réaliste fait à la main |
| **3 – Travaux** | Pièces, postes, gammes, artisans, devis, planning automatique, imprévus, recalcul du DPE, copropriété simple, travaux faits soi-même | Les coûts sont calés sur des prix réels, et le bot Rénovateur n'écrase pas les autres |
| **4 – Première tranche jouable** | Toute l'interface de gestion, barre d'état, décisions, agenda, création de partie, didacticiel de Gérard, 3 sauvegardes, export et import | Thibaud et sa femme jouent 2 ans de jeu à Dole sur téléphone sans bug bloquant |
| **5 – Monde vivant** | Rue par quartier, coupe d'immeuble, jour et nuit, météo, saisons, passants, bulles, panorama, ambiances et effets sonores, emplacements de musique, thème sombre | L'animation est fluide sur le téléphone de Thibaud |
| **6 – Rythme et progression** | Temps libre et agenda complets, pause et accélération automatiques, bilans et Yvon, catalogue de plus de 100 événements, anecdotes, réputation, titres, succès, défis, chronique, statistiques, modes de partie, retour en arrière, journal de partie | Les bots respectent la densité de décisions, et l'envie de jouer « encore un mois » est là |
| **7 – Villes** | Dijon, Chalon-sur-Saône, Besançon, carte de la région, déplacements, journée sur place, notoriété locale, artisans locaux, déménagement | Une expansion à Dijon est viable mais demande un vrai effort |
| **8 – Profondeur** | SCI, IFI, locaux commerciaux, parkings, terrains, colocation, location courte durée, maître d'œuvre, division, combles, arrivée de la SCI Horizon, crises nationales | Les titres Promoteur et Magnat sont atteignables dans les durées cibles |
| **9 – Finitions** | Équilibrage final, performances, accessibilité, finitions graphiques, nouvelles villes de France, Paris en mode défi | Thibaud a encore envie d'y jouer |

## Méthode de travail par jalon

1. Relire les chapitres listés dans [README.md](README.md#que-lire-selon-le-jalon).
2. Ouvrir une branche `jalon-N-<sujet>`.
3. Développer par petites étapes testées (moteur d'abord, interface ensuite).
4. Lancer les bots et lire le rapport d'équilibrage.
5. Ouvrir une pull request, la relire, la fusionner.
6. Mettre à jour la documentation si une décision a changé (et le journal de [10-points-ouverts.md](10-points-ouverts.md)).
7. Jouer (aux jalons jouables) et noter les impressions.

## Garde-fou contre la lassitude

- Ne pas jouer « pour tester » pendant le développement : ce sont les bots et les tests qui vérifient.
- Jouer vraiment seulement à la fin d'un jalon jouable (4, 6, 7, 8, 9), si possible quelques jours après l'avoir terminé.
