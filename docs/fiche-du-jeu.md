# Clé en main !

> Jeu de gestion immobilière en temps réel, sur téléphone, joué en solo dans de vraies villes françaises.
> Titre provisoire.

| | |
|---|---|
| **Genre** | Gestion et simulation économique (immobilier), en temps réel avec pause |
| **Plateforme** | PWA (application web installable) pour téléphone, en portrait ; fonctionne aussi sur ordinateur et tablette |
| **Joueurs** | Solo, sans multijoueur |
| **Langue** | Français uniquement |
| **Public** | Usage privé : Thibaud et sa femme, chacun sur son téléphone |
| **Hors ligne** | Oui, sans serveur ni compte |
| **Dépôt** | `KalypsT/cle-en-main` (public), publié sur GitHub Pages (adresse non référencée) |
| **Démarrage du projet** | 18 octobre 2026 |
| **État** | Jalons 0 à 8 réalisés, puis plusieurs lots de « plaisir de jeu » et des corrections après une analyse de jouabilité (octobre 2026). Reste le jalon 9, les finitions. |

---

## Le pitch

Tu es un salarié avec un petit apport et une ambition : bâtir un patrimoine immobilier en France. Tu repères les bonnes affaires avant les autres, tu négocies, tu rénoves pièce par pièce, tu loues et tu revends, au fil d'une seule partie sans fin, dans des villes réelles qui vivent sous tes yeux.

## L'histoire

Il n'y a **ni scénario ni niveaux** : les histoires naissent de la simulation.

On commence à **Dole**, dans le Jura, locataire d'un petit T2 à 520 € par mois, avec **15 000 €** d'épargne, un métier et une réputation presque nulle (titre de départ : *Locataire ambitieux*). La partie démarre à la **date réelle du jour** de sa création, puis le calendrier avance (2026, 2027…) : les lois datées, comme le calendrier d'interdiction des logements mal classés au DPE, tombent à leurs vraies dates.

Le premier studio mène, avec du temps et un peu d'audace, à l'empire : d'abord Dole, puis **Dijon**, **Chalon-sur-Saône** et **Besançon**, jusqu'au titre ultime de *Baron de la pierre*.

### Les personnages (tous fictifs)

| Personnage | Rôle |
|---|---|
| **Gérard Prudhomme** | Banquier de la Tirelire Comtoise, 58 ans, cravate en laine. Prudent mais fidèle. Il guide le didacticiel. |
| **Kévin Boost** | Crédit Fougueux : « on va scaler ton patrimoine ». Souple, taux un peu plus élevés. |
| **Hortense Rigueur** | Banque Rigueur & Fils. Les meilleurs taux, un dossier irréprochable exigé, et jamais un sourire. |
| **Yvon Tableur** | Le comptable : bilan annuel, conseils fiscaux, avis sur chaque annonce. |
| **Monique Delaporte** | Rivale. Retraitée redoutable, polie et implacable, très rapide sur les petites surfaces près des gares. |
| **Les frères Martinot** | Rivaux marchands de biens : achètent les ruines, les « rénovent », les revendent. Toujours deux à parler en même temps. |
| **SCI Horizon Patrimoine** | Fonds impersonnel qui arrive tard dans la partie et achète des immeubles entiers : « nous reviendrons vers vous ». |

S'y ajoutent des artisans, des agences et des locataires, chacun avec son caractère.

## Le style de jeu

### La boucle

```
Repérer une annonce ─► Visiter / diagnostiquer ─► Financer (banque)
        ▲                                               │
        │                                               ▼
  Réinvestir ◄── Encaisser (loyers, plus-values) ◄── Rénover ─► Louer ou revendre
        │
        └─► Réputation ↑ ─► meilleures conditions, biens hors marché, titres
```

Trois contraintes obligent à choisir : le **temps libre** du personnage (chaque visite ou rendez-vous en consomme), la **trésorerie** et la **capacité d'emprunt**.

### Les cinq piliers

1. **Un marché vivant** : les annonces apparaissent et disparaissent, les rivaux achètent sur le même marché. Hésiter a un coût.
2. **Chaque décision compte** : tout est un arbitrage entre argent, temps et risque.
3. **Partir de rien, sans plafond** : une seule carrière, rien n'est verrouillé, seuls les moyens limitent.
4. **Crédible sans être complexe** : la France réelle, avec des règles simplifiées mais justes (crédit, DPE, baux, fiscalité).
5. **Une ville qui respire** : le patrimoine se voit dans la rue, avec ses locataires, chantiers et passants, de jour comme de nuit.

### Ce que le jeu n'est pas

- **Pas un jeu idle** : rien ne s'accumule pendant qu'on regarde, il y a toujours une décision à prendre.
- **Pas de mini-jeux** : la richesse vient des décisions de gestion.
- **Pas de multijoueur.**
- **Pas un simulateur fiscal** : la fiscalité est un levier de jeu, pas de la paperasse.

### Le temps

- Vitesses : pause, ×1, ×2, ×4. À ×1, une journée dure environ 20 secondes, une année environ 2 heures.
- **Accélération automatique** à ×8 quand rien n'est en attente, **pause automatique** sur les décisions importantes (offre reçue, enchère, incident grave, assemblée de copropriété).
- Au quotidien : annonces, visites, candidatures, chantiers. Chaque mois : salaire, loyers, mensualités, bilan. Chaque année : impôts, taxe foncière, réévaluation, bilan annuel d'Yvon.
- Deux façons de jouer : une **session courte** d'environ 5 minutes (traiter les décisions, saisir une annonce) ou une **session longue** (prospecter une ville, restructurer ses crédits).

### Les systèmes simulés

- **Personnage et métiers** : fonctionnaire, enseignant, infirmier, développeur, électricien, commercial, agent immobilier. Chacun change le salaire, le temps libre et la confiance des banques (l'électricien fait lui-même l'électricité, l'agent immobilier voit certaines annonces avant les autres).
- **Banque et crédit** : trois banques, confiance de chaque banquier, taux d'endettement, renégociation, rachat, découvert.
- **Marché** : quartiers réels, annonces générées à partir des ventes réelles, offres et contre-offres, compromis, acte, enchères, revente.
- **Location** : baux nus et meublés, candidatures, agences, impayés, DPE et son calendrier, colocation, location courte durée.
- **Travaux** : chaque bien est découpé en pièces et en postes (état en partie caché), trois gammes (Éco, Standard, Premium), artisans, devis, imprévus, recalcul du DPE, copropriété, travaux faits soi-même, maître d'œuvre, division et combles.
- **Fiscalité** : régimes réel et LMNP, plus-value, taxe foncière, SCI, IFI.
- **Événements** : plus de 100 événements, anecdotes, défis, crises nationales.
- **Villes et déplacements** : carte de la région, trajets, journée sur place, notoriété locale, déménagement.
- **Autres biens** : locaux commerciaux, parkings, terrains, immeubles.

### La progression

- **Réputation** de 0 à 100, plus une notoriété par ville.
- **Titres** en deux branches qui se rejoignent : *Locataire ambitieux* → *Primo-investisseur* → *Bailleur* ou *Rénovateur* → *Investisseur aguerri* ou *Marchand de biens* → *Promoteur* → *Magnat* (1 M€ net) → *Baron de la pierre* (5 M€ net, 4 villes, réputation de 90).
- Environ **40 succès** (« De G à B », « Mme Delaporte en larmes », « Elle a souri »…), des **défis** lancés par les personnages, une **chronique de carrière** et des statistiques.
- Cibles de rythme : premier achat entre le 2e et le 6e mois, *Bailleur* en 2 à 4 ans, *Magnat* en 15 à 25 ans, *Baron* en plus de 30 ans.

### Les modes de partie

| | Serein | Classique | Exigeant |
|---|---|---|---|
| Incidents | moins fréquents | un peu moins fréquents | plus fréquents |
| Rivaux | plus lents | normaux | plus vifs |
| Faillite | ventes forcées seulement | nouveau départ (5 000 €, la moitié de la réputation) | fin de partie |
| Retours en arrière | illimités | 3 par partie | aucun |

La faillite se voit venir : alerte de trésorerie, découvert, gel du crédit, vente forcée, puis faillite.

## Le ton

Réaliste dans les chiffres, **avec des touches d'humour** dans les annonces, les personnages et les notifications. L'humour ne touche jamais au sérieux des calculs.

> « Charmant T2, potentiel à révéler, idéal bricoleur courageux. »
> « Veut partir élever des alpagas dans le Haut-Jura. »
> « M. Grosjean, du 2e, a voté contre, comme chaque année depuis 1987. »

## La direction artistique

- **Deux registres, une identité** : le monde (rue, coupe d'immeuble) est illustré et chaleureux ; la gestion est sobre et moderne. Les deux partagent un fond ivoire chaud.
- **Tout est dessiné par le code**, en 2D vectorielle, sans image générée par IA. Seule exception : le logo de l'écran titre (une clé en laiton à tête de maison et une étiquette « Clé en main ! »).
- **Façades générées par modules** selon l'époque et la ville : pierre calcaire dorée et canal des Tanneurs à Dole, pans de bois et tuiles vernissées à Dijon, pierre bleu-gris à Besançon, quais à Chalon. La Collégiale de Dole se dessine en silhouette.
- **Ville vivante** : matin, jour, soir et nuit, météo (pluie, neige, brouillard sur la Saône et le Doubs), saisons et décorations de Noël, passants avec parapluies, poussettes, chiens et baguettes, voitures, pigeons, chats aux fenêtres, fumée des cheminées, camions de déménagement.
- **Moments forts** : remise des clés à l'acte, trésorerie qui défile, médaillon de succès, scène de célébration à chaque titre.
- **Couleurs** : accent bleu volet (`#2b5c8a`), ambre pour les alertes, rouge brique pour le négatif, vert pour le positif. Thèmes clair, sombre ou automatique.
- **Polices** : Manrope pour l'interface, Fraunces pour le titre et les chiffres clés.
- **Son** : ambiances et effets synthétisés par le code (rumeur de la ville, cloches à midi, pluie, perceuse, « ka-ching » des loyers, tampon du notaire) ; emplacements prévus pour la musique de Thibaud.

## L'interface

- **5 onglets** : Rue · Carte · Décisions · Patrimoine · Menu.
- **Barre d'état** : date et heure, vitesse, trésorerie, temps libre du jour.
- Menu : Moi, Villes, Banque, Agenda, Carnet, Progression, Statistiques, Réglages.
- Rue vivante par quartier (vue panorama en paysage), coupe d'immeuble au toucher, carte de la ville colorée selon le prix ou le rendement.
- Chaque montant s'explique (« pourquoi ce montant ? »).
- Didacticiel désactivable, mené par Gérard pendant le premier mois.
- 3 emplacements de sauvegarde, export et import en JSON, retour en arrière sur les 6 derniers mois.

## Les outils techniques

| Besoin | Outil |
|---|---|
| Langage | TypeScript (strict) |
| Monorepo | pnpm 10 (workspaces), Node 22 LTS |
| Build et serveur de développement | Vite 8 |
| Écrans de gestion | React 19 |
| Rue vivante | PixiJS 8 (WebGL, repli Canvas) ; coupe d'immeuble en SVG |
| Validation du contenu | zod 4 |
| Application hors ligne | vite-plugin-pwa (service worker Workbox) |
| Sauvegardes | IndexedDB via `idb` |
| Son | Web Audio |
| Tests | Vitest (moteur, contenu, bots), Playwright (tests de fumée) |
| Qualité | ESLint, Prettier |
| CI et déploiement | GitHub Actions, GitHub Pages |
| Développement | Conçu et codé avec Claude Code |

### L'organisation du dépôt

```
cle-en-main/
├── packages/engine/   moteur de simulation (TypeScript pur, sans DOM)
├── packages/bots/     stratégies de bots, lanceur en ligne de commande, rapports d'équilibrage
├── apps/game/         la PWA (React + PixiJS)
├── content/           contenu écrit à la main (JSON validé par zod)
├── data/              données des villes, générées (Dole, Dijon, Chalon, Besançon)
├── tools/data/        scripts de données publiques
└── docs/              conception et spécifications, maquettes, analyses
```

### Les principes d'architecture

- **Moteur indépendant de l'interface** : il tourne aussi bien dans le navigateur que dans Node (bots, tests). L'interface ne calcule rien : elle lit l'état et envoie des actions (`dispatch`).
- **Déterministe** : un seul générateur aléatoire à graine, aucune horloge système. À graine et actions identiques, résultat identique. Des **parties de référence** (graines dorées) le vérifient.
- **État sérialisable** en JSON, format de sauvegarde **versionné avec migrations** : une mise à jour ne casse pas une partie en cours.
- **Aucun chiffre ni texte en dur** : taux, coûts, probabilités et textes vivent dans `content/`.
- **Performance** : 10 ans de jeu simulés en environ 4 secondes par le moteur seul.

### Les données réelles

Les villes sont construites à partir de données publiques : **DVF** (prix de vente réels), carte des loyers, **ADEME** (DPE), **INSEE** (IRIS, population), **cadastre** et **BD TOPO** de l'IGN (carte, quartiers). Les quartiers et leurs noms sont réels ; personnages, banques, agences et entreprises sont fictifs.

### L'équilibrage par bots

Onze bots jouent des milliers de parties sans interface pour caler les chiffres : *Prudent*, *Levier maximal*, *Naïf*, *Chasseur de bonnes affaires* (à Dole, et dans chacune des trois autres villes), *Marchand de biens*, *Rénovateur premium*, *Promoteur* et *Inactif* (qui ne doit jamais s'enrichir : test anti-idle). Leurs résultats sont comparés à des cibles chiffrées dans un rapport d'équilibrage.

## La feuille de route

| Jalon | Contenu | État |
|---|---|---|
| 0 – Fondations | Monorepo, PWA, horloge, hasard à graine, sauvegardes, CI | Fait |
| 1 – Noyau économique | Métiers, banques, données de Dole, marché, rivaux, bots | Fait |
| 2 – Location et fiscalité | Baux, locataires, DPE, impôts | Fait |
| 3 – Travaux | Pièces, postes, artisans, chantiers, copropriété | Fait |
| 4 – Première tranche jouable | Toute l'interface de gestion, didacticiel | Fait |
| 5 – Monde vivant | Rue, coupe, jour et nuit, météo, son | Fait |
| 6 – Rythme et progression | Événements, réputation, titres, succès, modes | Fait |
| 7 – Villes | Dijon, Chalon-sur-Saône, Besançon, déplacements | Fait |
| 8 – Profondeur | SCI, IFI, locaux, colocation, courte durée, transformations, SCI Horizon | Fait |
| 9 – Finitions | Équilibrage final, accessibilité, nouvelles villes, Paris en mode défi | À faire |

## Le critère de réussite

**Après l'avoir conçu et testé, on a encore envie de lancer une partie.**

C'est pour lui que le jeu repose sur une simulation (le contenu ne s'apprend pas par cœur), que l'équilibrage est confié à des bots et que le contenu écrit est généré par combinaisons.
