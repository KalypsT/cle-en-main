# 4. Interface et écrans

> Les maquettes de [maquettes/](maquettes/README.md) sont **préliminaires** : elles illustrent les intentions, pas un rendu figé.

## 4.1 Orientation et supports

- **Portrait** pour tout le jeu, sur téléphone : jeu d'une main, listes et fiches lisibles, coupe d'immeuble verticale, clavier virtuel peu gênant.
- **Mode panorama** pour l'écran Rue uniquement : en tournant le téléphone, une vue large du quartier, pour le plaisir de regarder la ville vivre. Aucune autre partie de l'interface n'a de version paysage.
- **Ordinateur et tablette** : mise en page large, la rue à gauche et la gestion à droite, grâce à une mise en page adaptative.

## 4.2 Le style

- **La rue et la coupe** : illustrées et chaleureuses (voir [05-direction-artistique.md](05-direction-artistique.md)).
- **Les écrans de gestion** : sobres et modernes, sur le même fond ivoire chaud que la rue, pour que les deux registres forment un tout.
- **Thème** au choix dans les réglages : Clair, Sombre, Automatique (sombre pendant la nuit du jeu) ou Selon le téléphone.
- Cibles tactiles d'au moins 44 px, textes d'au moins 12 px, contraste suffisant, couleurs jamais seules porteuses d'information.

## 4.3 La barre d'état

Toujours visible en haut de l'écran :
- date et heure du jeu ;
- vitesse (pause, ×1, ×2, ×4) ; la pause choisie est en rouge brique ;
- trésorerie ;
- temps libre restant aujourd'hui ;
- badge du nombre de décisions en attente.

## 4.4 La navigation

**5 onglets** en bas de l'écran : **Rue · Carte · Décisions · Patrimoine · Menu**.

Le Menu donne accès à : Villes, Banque, Agenda, Carnet, Progression, Statistiques, Réglages.

**Chaque onglet garde son écran.** Changer d'onglet puis revenir remet l'onglet tel qu'on l'a laissé (écrans empilés et position dans la page) ; toucher l'onglet déjà affiché revient à sa racine. Les filtres et le tri de la liste des annonces font partie de l'écran : ouvrir une annonce puis revenir les retrouve, comme la position dans la liste. Ils ne sont pas enregistrés dans la sauvegarde (le temps de la session seulement).

## 4.5 Inventaire des écrans

| Famille | Écrans |
|---|---|
| **Démarrage** | Titre (Continuer, Nouvelle partie, emplacements de sauvegarde) · Création de partie (nom, avatar, métier, mode) · Didacticiel |
| **Le monde** | **Rue vivante** par quartier (on glisse d'une rue à l'autre) · **Coupe d'immeuble** (au toucher d'un bâtiment) · **Carte de la ville** (quartiers colorés selon le prix, le rendement, la tendance ou les biens du joueur, épingles des annonces) · **Carte de la région** et fiche ville |
| **Acheter** | Liste des annonces (filtres, favoris) · Fiche annonce (photo de façade générée, DPE, financement simulé, défauts connus, rivaux intéressés, actions : visiter, diagnostic, offre) · Offre et contre-offre · Enchère en direct |
| **Mes biens** | Patrimoine (synthèse, courbes, cash-flow) · Fiche d'un bien (vue d'ensemble, état des pièces, location, finances, historique) · Chantier (plan pièce par pièce, postes, gammes, artisans, frise, imprévus, avant/après) · Location (annonce, candidatures, bail, fiche du locataire) · Assemblée de copropriété |
| **Argent** | Banque (crédits, simulateur, banquiers, demande de prêt, renégociation) · Bilan mensuel (court) · Bilan annuel (plein écran, conseils d'Yvon, régimes fiscaux, nouveau titre) |
| **Organisation** | Décisions (avec échéances) · Agenda léger et journée sur place · Carnet (artisans, agences, banquiers, comptable, rivaux) |
| **Progression** | Titres et réputation · Succès · Défis · Chronique · Statistiques |
| **Réglages** | Accélération et pauses automatiques · Thème · Volumes (musique, ambiances, effets) · Sauvegardes (export, import) · Revenir en arrière · Didacticiel |

> **Jalon 8** (emplacements validés) :
> - **Banque et SCI** (Menu) : les crédits en cours, le taux d'endettement personnel (sans la SCI), et la SCI : la créer, ce qu'elle détient, doit et peut encore emprunter, son comptable, les règles de ses banques.
> - **Compromis** : le choix « En nom propre » ou « Via la SCI », avant toute demande de prêt.
> - **Annonces** : filtres Local, Parking, Terrain ; façades simples pour un terrain et un parking, vitrine pour un local.
> - **Location** : seulement les baux possibles pour le bien (colocation, courte durée, bail commercial, parking), les agences de ce bail ; une location courte durée s'arrête depuis la fiche du bien.
> - **Fiche d'un bien** : « Transformer le bien » donne les devis du maître d'œuvre (travaux, honoraires, total, valeur estimée après, durée) et lance le projet ; le projet en cours y est suivi.
> - **Bilan annuel** : la ligne de l'IFI.
> - À faire avec l'écran de chantier (plus tard) : confier des postes au maître d'œuvre.

## 4.6 Interactions clés

- **Rue** : toucher une bulle (« À vendre », « Panne », « Travaux 25 % ») ouvre la fiche concernée ; toucher un bâtiment ouvre sa coupe.
- **Coupe** : toucher un appartement ouvre sa fiche ; pendant un chantier, on voit les artisans travailler pièce par pièce et l'avant/après.
- **Chaque montant important** peut être expliqué en un toucher (« pourquoi ce taux ? », « d'où vient cet impôt ? »).
- **Notifications** : discrètes pour l'information, pause automatique pour les décisions importantes.

## 4.7 Le didacticiel

- Pendant le **premier mois à Dole**, **Gérard Prudhomme** (La Tirelire Comtoise) accompagne pas à pas vers le premier achat : repérer une annonce, visiter, simuler le financement, faire une offre, signer le compromis.
- Puis **Yvon Tableur** présente le premier bilan.
- Désactivable, et il ne bloque jamais le joueur.

## 4.8 Les sauvegardes

- **3 emplacements** de partie.
- **Export et import** d'une partie en fichier (changement de téléphone).
- Points de retour en arrière (voir [02-boucle-et-progression.md](02-boucle-et-progression.md#27-le-retour-en-arrière)).
- **Retours de jeu après le jalon 8** : la partie est aussi sauvegardée dès que l'appli passe en arrière-plan ou que la page est quittée, et le jeu rouvre directement la dernière partie jouée (l'écran titre revient après « Retour à l'écran titre »). Une actualisation ne coûte donc rien ; le « tirer pour actualiser » est désactivé.
- **Chantier et vente** (retours après le jalon 8 : ces écrans manquaient) : « Faire des travaux » dans la fiche du bien ouvre le **chantier** : choisir les postes pièce par pièce et leur gamme, voir le coût de référence, la durée, le DPE, la valeur et le loyer après ; cocher « Je le fais moi-même » quand c'est permis ; demander un devis aux artisans du carnet pour chaque métier ; lancer le chantier avec les devis retenus, ou le confier au maître d'œuvre. Pendant le chantier : la frise des interventions et l'imprévu à trancher (traiter, reporter, passer en Éco). « Vendre » ouvre la **vente** : prix (avec l'estimation), agence ou soi-même, ce qui reste après les frais, le crédit, les indemnités et l'impôt ; puis les offres (accepter, refuser, contre-proposer). Un bien loué se vend avec son locataire.
- **Banque, détail des crédits** (retours après le jalon 8) : pour tous les crédits, la mensualité totale, le capital restant dû, les intérêts restants et la courbe du capital restant dû année par année ; puis une carte par crédit : le bien financé, la part remboursée, l'emprunt, le restant dû, la mensualité, le taux, les intérêts payés et à payer, la dernière mensualité, et la banque la moins chère du jour si elle fait mieux (économie nette des frais, bouton de rachat). Les intérêts déjà payés suivent le tableau d'amortissement d'origine (requête `loanSheets`).
- **Valeur d'un bien** (onglet Finances de la fiche, retours après le jalon 8) : valeur estimée, prix d'achat, plus-value latente, crédit restant dû et part possédée ; une courbe mois par mois de la valeur, du prix d'achat et du crédit restant (estimation du jour de l'acte, puis du 1er de chaque mois).
- **Version du jeu** (Réglages) : numéro du déploiement (exécution de la CI), date de construction, commit et format de sauvegarde ; « Rechercher une mise à jour », et « Mettre à jour » quand une nouvelle version est prête (la partie est sauvegardée avant le rechargement). Le jeu cherche aussi tout seul toutes les heures et à chaque retour au premier plan ; le bandeau « Une nouvelle version est disponible » reste affiché partout.
- **Départ négocié** (onglet Location de la fiche) : la fourchette habituelle de l'indemnité en mois et en euros, le montant proposé, le coût en temps et en réputation ; après un refus, la date de la prochaine proposition possible. L'écran **Vente** annonce la décote d'un bien vendu loué (chapitre 3.4).
- **Bouton retour du téléphone** : il remonte d'un écran, puis revient à la Rue ; sur la Rue, il ne fait rien (on ne quitte jamais la partie par erreur).

## 4.9 La Rue (jalon 5)

- **La rue vivante** remplit l'onglet Rue : les rues du quartier sont posées bout à bout et l'on glisse du doigt de l'une à l'autre (les flèches autour du nom de la rue font de même). Le quartier se choisit en haut à gauche. Les rues de chaque quartier sont décrites dans `content/monde.json` (noms réels de Dole, à vérifier sur place et modifiables sans toucher au code).
- **Les bâtiments** : des immeubles et maisons ordinaires (tirés des époques et du mélange appartements/maisons du quartier), plus les biens du joueur, les annonces, les biens sous compromis et les chantiers des rivaux, qui prennent chacun la place d'un immeuble ordinaire, tirée de leur identifiant. Chaque rue a un nombre fixe de places (`placesPerBuilding` fois ses immeubles ordinaires, `content/monde.json`) : elle garde sa longueur, et les biens du joueur, placés en premier, ne bougent plus quand une annonce arrive ou part (retours après le jalon 8).
- **Les bulles** ouvrent les fiches existantes : « À vendre » (annonce), « Compromis », « Panne », « Impayé », « Imprévu », « Travaux 25 % », « 2 offre(s) », « 3 candidat(s) », « Assemblée », « Vendu », « À louer ». Deux au plus par bâtiment, les plus urgentes d'abord.
- **Toucher un bâtiment** ouvre sa **coupe** : les logements étage par étage, le logement du joueur (ou l'annonce) cerclé de sa couleur avec ses pièces, leur usure et les artisans au travail ; toucher le logement ouvre sa fiche. La liste des pièces et de leur état suit le dessin.
- **Le tableau de bord du jalon 4 n'est pas perdu** : il devient un **tiroir** sous la rue. Fermé, il montre le bonjour, le patrimoine net et le solde du mois ; ouvert (toucher la poignée), les opportunités, les décisions et les nouvelles. Sur grand écran, il reste ouvert dans la colonne de droite, la rue à gauche.
- **Panorama** : téléphone tourné, la Rue passe en plein écran avec une barre d'état réduite (date, heure, vitesse) ; les autres écrans demandent de revenir en portrait.
- **Thème** : Clair, Sombre, Automatique (sombre pendant la nuit du jeu), Selon le téléphone (par défaut).
- **Réglages de la rue** : qualité graphique (Automatique, Haute, Économie) et compteur d'images par seconde, pour vérifier la fluidité sur le téléphone.

## 4.10 Rythme et progression (jalon 6)

- **Barre d'état** : quand l'accélération automatique joue, l'horloge passe à ×4 sans changer le bouton choisi (×1), et l'heure porte la mention « accéléré ».
- **Réponses récentes** (onglet Décisions, sous les décisions) : les offres refusées et les contre-offres expirées, avec le bien et le montant ; un toucher ouvre l'annonce, « Fermer » ou « Tout fermer » les retire de la liste (l'annonce garde son encadré). Une notification s'affiche aussi au moment de la réponse.
- **Décisions** : les événements du catalogue (« Événement : à vous de décider », avec le bien ou la famille) et les défis proposés y apparaissent. L'écran d'un événement montre son texte, ses choix avec leur montant et le temps libre qu'ils demandent, et le choix appliqué sans réponse.
- **Rue** : une bulle « Événement » sur le bien concerné ; une bulle « … » pour une anecdote récente, qui s'affiche au toucher.
- **Bilans** : le bilan du mois s'ouvre par-dessus le jeu le 1er de chaque mois (réglage), le bilan annuel avec Yvon Tableur le 1er janvier ; tous deux arrêtent l'horloge et se retrouvent dans le Menu.
- **Nouveau titre** : une fenêtre de célébration avec des confettis (sans animation si « réduire les animations ») et la musique de célébration.
- **Menu** : Agenda, Bilan du mois, Bilan annuel, Progression (onglets Titres et réputation, Succès, Défis, Chronique), Statistiques (courbes, records, compteurs), Réglages.
- **Réglages** : accélération automatique, bilan mensuel, Revenir en arrière (les points du 1er des derniers mois, avec le patrimoine net, et les retours restants), export du journal de partie.
- **Création de partie** : choix du mode (Serein, Classique, Exigeant) avec sa description.
- **Faillite** : une fenêtre « Nouveau départ » (Classique, Serein) ou « Fin de partie » (Exigeant), qui mène à la chronique.

## Jalon 7 : villes

- **Menu > Villes** : carte schématique de la région (les 4 villes, la base en vert, un point orange sur les villes où le joueur possède un bien, les durées de trajet sur les liaisons) et la fiche de la ville touchée : trajet depuis la base, prix, loyer, rendement, tendance, ventes et annonces, frais à distance, notoriété locale, biens possédés, artisans connus, coût des travaux. Trois boutons : voir la rue, voir les annonces, **déménager ici** (avec confirmation : coût, loyer, délai).
- **La ville regardée** : la rue, la carte de la ville, les annonces et la coupe d'immeuble montrent la ville choisie (la base au départ, ou la ville du dernier bien acheté). « Changer de ville » ouvre l'écran Villes depuis le tableau de bord et la carte.
- **Fiche d'annonce** : le bouton de visite affiche le trajet et son coût quand il n'est pas encore fait ce jour-là ; l'**agenda** montre, pour chaque jour, le trajet vers chaque ville et l'action avec le nom de sa ville.

