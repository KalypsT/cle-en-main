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

> **Plaisir de jeu, lot 1** (2026-10-22, point ouvert n° 17) : la barre tient sur **deux lignes courtes**, sans cases : date et heure à gauche, vitesse à droite ; puis la trésorerie (icône €, toucher ouvre le Patrimoine) et le temps libre (icône d'horloge, petite jauge). Environ 80 px au lieu de 135. Le bouton des décisions disparaît : leur nombre reste sur l'onglet Décisions. Quand la trésorerie change, le montant **défile** vers sa nouvelle valeur, s'éclaire en vert ou en rouge, et la différence (« +450 € ») passe sous le montant (rien de tout cela si le téléphone demande moins d'animations).

## 4.4 La navigation

**5 onglets** en bas de l'écran : **Rue · Carte · Décisions · Patrimoine · Menu**.

Le Menu donne accès à : Villes, Banque, Agenda, Carnet, Progression, Statistiques, Réglages.

**Chaque onglet garde son écran.** Changer d'onglet puis revenir remet l'onglet tel qu'on l'a laissé (écrans empilés et position dans la page) ; toucher l'onglet déjà affiché revient à sa racine. Les filtres et le tri de la liste des annonces font partie de l'écran : ouvrir une annonce puis revenir les retrouve, comme la position dans la liste. Ils ne sont pas enregistrés dans la sauvegarde (le temps de la session seulement).

## 4.5 Inventaire des écrans

| Famille | Écrans |
|---|---|
| **Démarrage** | Titre (Continuer, Nouvelle partie, emplacements de sauvegarde) · Création de partie (nom, avatar, métier, mode) · Didacticiel |
| **Le monde** | **Rue vivante** par quartier (on glisse d'une rue à l'autre) · **Coupe d'immeuble** (au toucher d'un bâtiment) · **Carte de la ville** (quartiers colorés selon le prix, le rendement, la tendance ou les biens du joueur, épingles des annonces ; zoom au pincement, à la molette, au double toucher ou aux boutons +/−, déplacement au doigt, bouton « Voir toute la ville » ; les épingles gardent leur taille et se regroupent en bulles numérotées quand elles se touchent, un toucher zoome dessus ; la vue est gardée en changeant d'onglet) · **Carte de la région** et fiche ville |
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

> **Progression, étape 3 : le cash-flow prévu** (2026-10-21, point ouvert n° 16). Le joueur voit avant d'acheter si un bien se paiera tout seul :
> - **Fiche annonce** : une carte « Cash-flow prévu » (requête `cashFlowOutlook` du moteur) donne le solde mensuel du bien financé par la banque du compte sur **25 ans**, apport limité aux frais, loué nu au loyer de marché, avant impôt, sans vacance ni incident ; le « ? » détaille loyer, charges récupérées, charges du propriétaire, mensualité. En vert à +30 € ou plus, en rouge à −30 € ou moins, neutre entre les deux (`cashFlowEuros` et `outlookYears` de `content/textes/yvon.json`). Une phrase d'Yvon Tableur l'accompagne ; quand le bien coûterait de l'argent, il donne le **prix auquel il se paierait tout seul** (arrondi au millier d'euros inférieur).
> - **Offre** : le même calcul au montant saisi, mis à jour en direct, avec la phrase d'Yvon.
> - **Liste des annonces** : le cash-flow prévu au prix affiché sous le rendement brut de chaque annonce (dans une partie d'essai, après deux mois, 207 annonces sur 287 coûteraient de l'argent au prix affiché).
> - **Financement simulé** : sa durée par défaut passe de 20 à 25 ans, comme le cash-flow prévu.
> - **Bilan annuel** : un nouveau conseil d'Yvon nomme le bien loué qui coûte le plus chaque mois (−30 € ou moins), avec son montant. Format de sauvegarde **v20** (ce conseil s'ajoute aux types possibles ; rien à convertir).

## 4.6 Interactions clés

- **Rue** : toucher une bulle (« À vendre », « Panne », « Travaux 25 % ») ouvre la fiche concernée ; toucher un bâtiment ouvre sa coupe.
- **Coupe** : toucher un appartement ouvre sa fiche ; pendant un chantier, on voit les artisans travailler pièce par pièce et l'avant/après.
- **Chaque montant important** peut être expliqué en un toucher (« pourquoi ce taux ? », « d'où vient cet impôt ? »).
- **Notifications** : discrètes pour l'information, pause automatique pour les décisions importantes.

> **Plaisir de jeu, lot 1** (2026-10-22, point ouvert n° 17) :
> - **Bonnes nouvelles** : une carte sous la barre d'état, bordée de vert, qui n'arrête pas le temps et part seule au bout de 4 secondes environ (ou au toucher) : offre acceptée, prêt accordé ou proposé (avec le montant et le taux), compromis signé, locataire qui emménage, chantier terminé, aide à la rénovation, vente conclue, bien vendu, crédit remboursé, transformation terminée, bien hors marché proposé, défi réussi. Celui qui l'apporte y figure quand il a un visage : le banquier (souriant, sauf Hortense Rigueur), le locataire, le donneur du défi. Arrivées ensemble (en vitesse rapide), elles sont regroupées : « 3 bonnes nouvelles ». Elles attendent qu'un bilan ou une scène soit fermé. Les refus gardent leur notification d'avant.
> - **Succès débloqué** : la même carte, dorée, avec un médaillon de trophée, le nom du succès et sa description.
> - **Remise des clés** : à la signature de l'acte, une scène au-dessus du jeu : la clé à tête de maison entre dans une serrure en laiton et tourne, puis « Vous êtes propriétaire ! », la façade du bien, son prix, « Voir mon bien » et « Continuer ». Complète (confettis, musique de célébration) pour le premier achat ; courte ensuite (« Une clé de plus au trousseau »), elle se ferme seule au bout de 3,6 secondes. Elle passe avant la célébration d'un nouveau titre.
> - **Vibrations** (réglage « Vibrations », activé par défaut, affiché seulement si le téléphone sait vibrer, donc pas sur iPhone) : un coup bref au tampon du notaire, deux petits à l'arrivée des loyers.
> - **Mode hors ligne** : la note « Le jeu est prêt à fonctionner hors ligne » ne s'affiche qu'une fois par appareil, en petite pastille verte en haut de l'écran.

## 4.7 Le didacticiel

- Pendant le **premier mois à Dole**, **Gérard Prudhomme** (La Tirelire Comtoise) accompagne pas à pas vers le premier achat : repérer une annonce, visiter, simuler le financement, faire une offre, signer le compromis.
- Puis **Yvon Tableur** présente le premier bilan.
- Désactivable, et il ne bloque jamais le joueur.

> **Plaisir de jeu, lot 1** (2026-10-22, point ouvert n° 17) : la bulle ne pousse plus le haut de chaque écran. Elle **flotte en bas**, au-dessus des onglets (et au-dessus du tiroir de la Rue ou des boutons « Visiter / Faire une offre » de l'annonce). Un chevron la **replie** en pastille au visage de Gérard, à droite ; elle se rouvre d'un toucher, et d'elle-même à l'étape suivante. Chaque étape peut **désigner un bouton** (`target` dans `content/textes/didacticiel.json`) : il porte un halo bleu qui pulse (un contour fixe si le téléphone demande moins d'animations), comme l'onglet qui y mène. Pause, annonces, Visiter, Simuler le financement, Faire une offre, Demander un prêt, Accepter l'offre de prêt.

## 4.8 Les sauvegardes

- **3 emplacements** de partie.
- **Export et import** d'une partie en fichier (changement de téléphone).
- Points de retour en arrière (voir [02-boucle-et-progression.md](02-boucle-et-progression.md#27-le-retour-en-arrière)).
- **Retours de jeu après le jalon 8** : la partie est aussi sauvegardée dès que l'appli passe en arrière-plan ou que la page est quittée, et le jeu rouvre directement la dernière partie jouée (l'écran titre revient après « Retour à l'écran titre »). Une actualisation ne coûte donc rien ; le « tirer pour actualiser » est désactivé.
- **Chantier et vente** (retours après le jalon 8 : ces écrans manquaient) : « Faire des travaux » dans la fiche du bien ouvre le **chantier** : choisir les postes pièce par pièce et leur gamme, voir le coût de référence des postes confiés aux artisans, les matériaux et le temps libre des postes faits soi-même (le prix d'artisan est barré dès qu'on coche « Je le fais moi-même », quand c'est permis), le total estimé, la durée, le DPE, la valeur et le loyer après ; demander un devis aux artisans du carnet pour chaque métier ; lancer le chantier avec les devis retenus, ou le confier au maître d'œuvre. Pendant le chantier : la frise des interventions et l'imprévu à trancher (traiter, reporter, passer en Éco). « Vendre » ouvre la **vente** : prix (avec l'estimation), agence ou soi-même, ce qui reste après les frais, le crédit, les indemnités et l'impôt ; puis les offres (accepter, refuser, contre-proposer). Un bien loué se vend avec son locataire.
- **Banque, détail des crédits** (retours après le jalon 8) : pour tous les crédits, la mensualité totale, le capital restant dû, les intérêts restants et la courbe du capital restant dû année par année ; puis une carte par crédit : le bien financé, la part remboursée, l'emprunt, le restant dû, la mensualité, le taux, les intérêts payés et à payer, la dernière mensualité, et la banque la moins chère du jour si elle fait mieux (économie nette des frais, bouton de rachat). Les intérêts déjà payés suivent le tableau d'amortissement d'origine (requête `loanSheets`).
- **Biens vendus** (Patrimoine, sous la liste des biens ; historique, étape 3) : chaque bien vendu reste, le plus récent en haut, avec sa date de vente, son prix, sa plus-value et un badge « Vente forcée » s'il a été vendu par la banque. Sa fiche, en lecture seule, a trois onglets : **Bilan** (achat, prix et frais, travaux de l'historique, loyers encaissés hors charges, durée de détention ; vente, frais d'agence, crédit remboursé, indemnités, impôt sur la plus-value, dépôt remis à l'acheteur, reste sur le compte, plus-value), **Valeur** (la courbe mois par mois jusqu'à la vente) et **Historique** (celui de la fiche). Les loyers ne sont comptés que depuis le format de sauvegarde 17 pour les biens déjà possédés. Une nouvelle ou une lettre sur un bien vendu ouvre cette fiche.
- **Banque, crédits soldés et banquiers** (historique, étape 4) : sous les crédits en cours, la liste **Vos banquiers** (confiance, dernier rendez-vous) puis les **Crédits soldés**, le plus récent en haut : banque et montant, comment il s'est terminé (remboursé jusqu'au bout, à la vente du bien, racheté par une autre banque, effacé par la faillite), le bien financé, taux, mensualité, début et fin, mensualités payées, restant dû et indemnités à la fin, intérêts payés. La fiche d'un **banquier** montre la courbe de sa confiance (le 1er de chaque mois), l'historique de la relation (rendez-vous avec la confiance obtenue, réponses aux demandes de prêt avec le bien et le motif d'un refus) et les crédits chez cette banque, en cours et soldés. Tout cela est gardé sans limite.
- **Historique d'un bien** (onglet « Historique » de la fiche, retours après le jalon 8) : travaux terminés (poste, gamme, date, artisan ou « vous-même », coût ou matériaux), entrées de locataires (loyer) et départs (durée du bail, dernier loyer, dépôt rendu, dégâts retenus), incidents réparés ; le plus récent en haut. Les biens des parties en cours partent d'un historique vide.
  - **Enrichi** (historique, étape 6, format 18) : l'achat chez le notaire ; la mise en vente (prix, agence ou particulier), son retrait, l'offre acceptée, la vente annulée ; la mise en location (bail, loyer, gestion, garantie), son retrait, les meubles ; le préavis (date et raison), le départ négocié, les impayés (couverts ou non), les relances, la procédure d'expulsion, les révisions de loyer, les reconductions de bail ; l'alerte DPE ; la fin de chaque chantier (coût total, imprévus compris, et DPE avant → après) ; l'assemblée générale (verdict de chaque résolution) ; la transformation (les lots d'une division héritent de l'historique du bien d'origine) ; l'installation ou le départ du joueur ; le changement de régime fiscal. Des filtres : Tout, Travaux, Locataires, Achat et vente, Autres. Ces lignes ne commencent qu'à la mise à jour pour les biens déjà possédés.
- **Anciens locataires** (onglet Location de la fiche, et onglet « Locataires » d'un bien vendu ; historique, étape 7, format 19) : chaque locataire parti, le plus récent en haut : nom et profil, dates et durée, raison du départ, dernier loyer, loyers encaissés et mois impayés, satisfaction au départ, dépôt rendu et dégâts retenus. Le bail en cours montre aussi ses loyers encaissés et ses mois impayés. Un locataire parti avant la mise à jour n'a ni loyers, ni impayés, ni satisfaction (« Parti avant ce suivi »).
- **Courbes de marché** (historique, étape 8, format 19) : le taux de marché et le niveau de prix de chaque quartier sont relevés au début de la partie puis le 1er de chaque mois. Les Statistiques montrent la courbe du taux et celle des quartiers de la ville de base (indice 100 au premier relevé) ; la fiche d'une ville, celle de ses quartiers ; la fiche d'une annonce, « Prix du quartier : +x % en n mois » (sur 12 mois, ou depuis le premier relevé).
- **Chronique enrichie** (historique, étape 9) : création de la SCI, arrivée d'un rival, chaque déménagement, et une seule fois le premier achat hors de sa ville, la première expulsion, le premier crédit remboursé jusqu'au bout et la première transformation.
- **Bilans conservés** (historique, étape 5, format 18) : le **Bilan du mois** garde les 24 derniers mois (`content/rythme.json`, `statementsKept`) ; « Mois précédent » et « Mois suivant » les parcourent (un mois passé montre la réputation du jour du bilan, sans le défi ni la série en cours). Le **Bilan annuel** garde toutes les années avec leur impôt (IFI compris) ; des pastilles choisissent l'année. Une partie en cours garde son dernier bilan mensuel et son dernier bilan annuel.
- **Valeur d'un bien** (onglet Finances de la fiche, retours après le jalon 8) : valeur estimée, prix d'achat, plus-value latente, crédit restant dû et part possédée ; une courbe mois par mois de la valeur, du prix d'achat et du crédit restant (estimation du jour de l'acte, puis du 1er de chaque mois).
- **Version du jeu** (Réglages) : numéro du déploiement (exécution de la CI), date de construction, commit et format de sauvegarde ; « Rechercher une mise à jour », et « Mettre à jour » quand une nouvelle version est prête (la partie est sauvegardée avant le rechargement). Le jeu cherche aussi tout seul toutes les heures et à chaque retour au premier plan ; le bandeau « Une nouvelle version est disponible » reste affiché partout.
- **Départ négocié** (onglet Location de la fiche) : la fourchette habituelle de l'indemnité en mois et en euros, le montant proposé, le coût en temps et en réputation ; après un refus, la date de la prochaine proposition possible. L'écran **Vente** annonce la décote d'un bien vendu loué (chapitre 3.4).
- **Bouton retour du téléphone** : il remonte d'un écran, puis revient à la Rue ; sur la Rue, il ne fait rien (on ne quitte jamais la partie par erreur).

## 4.9 La Rue (jalon 5)

- **La rue vivante** remplit l'onglet Rue : les rues du quartier sont posées bout à bout et l'on glisse du doigt de l'une à l'autre (les flèches autour du nom de la rue font de même). Le quartier se choisit en haut à gauche. Les rues de chaque quartier sont décrites dans `content/monde.json` (noms réels de Dole, à vérifier sur place et modifiables sans toucher au code).
- **Les bâtiments** : des immeubles et maisons ordinaires (tirés des époques et du mélange appartements/maisons du quartier), plus les biens du joueur, les annonces, les biens sous compromis et les chantiers des rivaux, qui prennent chacun la place d'un immeuble ordinaire, tirée de leur identifiant. Chaque rue a un nombre fixe de places (`placesPerBuilding` fois ses immeubles ordinaires, `content/monde.json`) : elle garde sa longueur, et les biens du joueur, placés en premier, ne bougent plus quand une annonce arrive ou part (retours après le jalon 8).
- **Les bulles** ouvrent les fiches existantes : « À vendre » (annonce), « Compromis », « Panne », « Impayé », « Imprévu », « Travaux 25 % », « 2 offre(s) », « 3 candidat(s) », « Assemblée », « Vendu », « À louer ». Deux au plus par bâtiment, les plus urgentes d'abord.
- **Toucher un bâtiment** ouvre sa **coupe** : les logements étage par étage, le logement du joueur (ou l'annonce) cerclé de sa couleur avec ses pièces, leur usure et les artisans au travail ; toucher le logement ouvre sa fiche. La liste des pièces et de leur état suit le dessin.
- **Le tableau de bord du jalon 4 n'est pas perdu** : il devient un **tiroir** sous la rue. Fermé, il montre le bonjour, le patrimoine net et le solde du mois (et le lien « Changer de ville » quand on regarde une autre ville que la sienne ; la rue s'arrête juste au-dessus, à la hauteur réelle du tiroir, pour que la chaussée reste visible) ; ouvert (toucher la poignée), les opportunités, les décisions et les nouvelles. Sur grand écran, il reste ouvert dans la colonne de droite, la rue à gauche.
- **Panorama** : téléphone tourné, la Rue passe en plein écran avec une barre d'état réduite (date, heure, vitesse) ; les autres écrans demandent de revenir en portrait.
- **Thème** : Clair, Sombre, Automatique (sombre pendant la nuit du jeu ; à ×4 et au-delà, il garde le moment où le temps s'est accéléré, voir 05, 5.4), Selon le téléphone (par défaut).
- **Réglages de la rue** : qualité graphique (Automatique, Haute, Économie) et compteur d'images par seconde, pour vérifier la fluidité sur le téléphone.

## 4.10 Rythme et progression (jalon 6)

- **Barre d'état** : quand l'accélération automatique joue, l'horloge passe à ×4 sans changer le bouton choisi (×1), et l'heure porte la mention « accéléré ».
- **Onglet Décisions en trois sections** (retours après le jalon 8 ; remplace « Réponses récentes ») : un sélecteur en haut, chaque section avec son compte ; la section choisie est gardée le temps de la session.
  - **À décider** : les décisions en attente, avec leur échéance (inchangé).
  - **Courrier** : les réponses reçues et les décisions tranchées, le plus récent en haut : réponses des vendeurs (offre acceptée, refusée, contre-offre expirée ou déclinée), réponses des banques (montant et taux, ou motif du refus), réponses des acheteurs pendant une revente (contre-offre acceptée ou refusée, offre expirée), départ négocié accepté ou refusé, événements du catalogue tranchés (le choix, le texte de l'événement, sa conséquence, et « Sans réponse, choix par défaut » si le délai a joué), résultats d'assemblée générale (verdict de chaque résolution), imprévus de chantier tranchés. Chaque lettre porte sa date et le bien concerné (tel qu'il était, même vendu ou retiré) ; un toucher ouvre le bien, le compromis ou l'annonce s'ils existent encore. « Fermer » ou « Tout fermer » la retirent de la liste ; sinon elle disparaît d'elle-même au bout de 12 mois (`content/rythme.json`, `inbox.mailKeptDays`) ou quand il y en a plus de 80 (les lettres fermées partent d'abord). L'annonce garde son encadré « Dernière réponse du vendeur » même après la fermeture de la lettre. Une notification s'affiche toujours au moment d'un refus.
  - **Actualités** : le fil des nouvelles des 180 derniers jours (150 au plus, `inbox.newsKept` et `inbox.newsKeptDays`), le plus récent en haut, avec la date, le bien et un lien « Voir le bien » ; des filtres par famille (Tout, Achats, Location, Travaux, Argent, Vie locale, Progression) ; les nouvelles arrivées depuis la dernière visite sont marquées « Nouveau ». Le fil laisse de côté le calendrier, le va-et-vient du marché (nouvelles annonces, baisses de prix, ventes à d'autres) et la confirmation de ses propres rendez-vous ; il garde en revanche la vente, le retrait ou la baisse de prix d'une annonce **suivie** (favorite, ou sur laquelle le joueur a fait une offre).
  - Courrier et actualités sont **enregistrés dans la sauvegarde** : ils survivent à une fermeture du jeu, à un export et suivent le retour en arrière. Les « Dernières nouvelles » du tableau de bord de la Rue en montrent les 6 plus récentes, avec « Tout voir ».
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

