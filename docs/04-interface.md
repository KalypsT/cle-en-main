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
- vitesse (pause, ×1, ×2, ×4) ;
- trésorerie ;
- temps libre restant aujourd'hui ;
- badge du nombre de décisions en attente.

## 4.4 La navigation

**5 onglets** en bas de l'écran : **Rue · Carte · Décisions · Patrimoine · Menu**.

Le Menu donne accès à : Villes, Banque, Agenda, Carnet, Progression, Statistiques, Réglages.

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
