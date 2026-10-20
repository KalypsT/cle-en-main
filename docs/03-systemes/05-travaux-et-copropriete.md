# 3.5 Travaux et copropriété

C'est le cœur ludique de la gestion. Pas de mini-jeux : la richesse vient des choix.

> **Réalisation au jalon 3** (`packages/engine/src/systems/dwelling.ts`, `works.ts`, `works-view.ts`, `copro.ts` ; règles et prix dans `content/travaux.json`, artisans dans `content/artisans.json`, textes dans `content/textes/travaux.json`). L'état simplifié du jalon 1b (5 niveaux globaux et défauts cachés) est remplacé par les pièces et les postes. Les précisions ci-dessous complètent le texte de conception là où il restait muet.
>
> - **Pièces** : un logement est découpé selon sa surface et son nombre de pièces (entrée 6 %, cuisine 12 %, salle de bain 7 %, chambres 14 % chacune, WC séparé dès 40 m², le séjour prend le reste ; une maison a un jardin). Un immeuble entier a les pièces de chacun de ses appartements.
> - **Postes** : sols, murs et plafonds, portes et placards, cuisine, salle de bain, WC, jardin ; **éléments du logement** : électricité, plomberie, chauffage, isolation, fenêtres, ventilation, et toiture et façade pour une maison ou un immeuble ; **parties communes** pour un appartement (seule la copropriété peut les rénover). Chaque poste a un état de 1 à 5, une gamme (les équipements d'origine comptent comme Standard) et un drapeau « connu ».
> - **Génération** : l'annonce garde l'un des 5 états globaux, tirés des données ; chaque poste est tiré autour de l'état moyen de cet état global (1,3 ; 2,3 ; 3,1 ; 4 ; 4,7, écart type 0,7) ; l'électricité, la plomberie, le chauffage et les parties communes un peu au-dessus (on répare l'essentiel en premier) ; les postes énergétiques selon le DPE tiré des données (de +1,2 en A à −1,2 en G). L'état global affiché sur l'annonce est l'état moyen le plus proche de l'état pondéré du logement.
> - **Ce qui est caché** : rien n'est connu avant la visite (l'estimation compte alors chaque poste à l'état moyen annoncé). La visite montre les pièces et les fenêtres, et seulement parfois l'électricité (60 %), la plomberie (50 %), le chauffage (70 %), l'isolation (30 %), la ventilation (60 %), la toiture (40 %), la façade (90 %), les parties communes (80 %). Le **diagnostic par un artisan** (action `market/diagnose`, 180 €, sans temps libre) révèle tous les postes de son métier. Tout est connu à l'acte. Seul défaut caché restant : les voisins bruyants (aucun travaux n'y peut rien).
> - **Valeur** : l'état pondéré (poids de chaque poste, réparti entre les pièces selon leur surface) donne un facteur de 0,52 (tout à refaire) à 1,12 (neuf), interpolé. Les postes visibles (cuisine, salle de bain, sols, murs) pèsent environ 1,5 fois leur part du coût des travaux, les postes techniques 0,6 fois : un rafraîchissement bien choisi rapporte, une électricité refaite rapporte surtout la décence, le DPE et moins d'incidents. La **gamme** des postes rénovés ajoute −4 % (Éco) à +8 % (Premium) en valeur et −2 % à +6 % en loyer, mais ce bonus **s'arrête au 3e quartile des prix au m² du quartier** (`valueCeiling`) : du Premium dans un quartier modeste rapporte peu.
> - **Décence** : un logement est indécent (aucun nouveau bail) si son état pondéré est sous 1,8 ou si l'électricité, la plomberie ou le chauffage est à 1. Le loyer suit l'état pondéré (de 0,80 à 1,05), la satisfaction du locataire aussi (de −30 à +8), et chaque incident dépend de l'état de son poste (chauffe-eau et fuite : plomberie ; chauffage ; serrure : portes ; humidité : ventilation).
> - **DPE** : un modèle d'énergie primaire (kWh/m²/an) par époque, multiplié par l'état et la gamme du chauffage, de l'isolation, des fenêtres, de la ventilation, de la toiture et de la façade (Premium : pompe à chaleur, isolation renforcée, ITE, double flux), calé sur la classe tirée des données pour chaque bien ; seuils réels du DPE (A ≤ 70, B ≤ 110, C ≤ 180, D ≤ 250, E ≤ 330, F ≤ 420). Le DPE est recalculé à la fin d'un chantier (ou d'un vote de copropriété) ; la requête `worksEstimate` affiche la classe estimée avant de valider.
> - **Devis** (`works/quote`, 30 min de temps libre) : un artisan du carnet chiffre des postes de son métier au prix de référence × son multiplicateur × sa remise de fidélité (1 % par chantier, 5 % au plus), avec un écart de ±5 % ; il donne sa date de disponibilité (file d'attente, raccourcie par la fidélité et la réputation) ; un devis vaut 60 jours.
> - **Chantier** (`works/start`) : devis signés et postes faits soi-même ; un acompte de 30 % est payé à la signature, le reste à la fin de chaque intervention, d'abord sur l'**enveloppe travaux** du prêt. Le planning est automatique : une tâche par artisan et par phase (1 toiture et façade ; 2 électricité, plomberie, chauffage, ventilation ; 3 isolation et fenêtres ; 4 cuisine, salle de bain, WC ; 5 murs ; 6 sols, portes, jardin) ; une phase commence quand les précédentes sont finies et que l'artisan est libre. La requête `worksPlan` donne la frise. La fiabilité de l'artisan décide du dépassement (jusqu'à 30 % × (1 − fiabilité)), du retard (jusqu'à 80 % × (1 − fiabilité)) et d'un poste rendu à 4 au lieu de 5.
> - **Imprévus** (au démarrage d'une tâche, au plus un par tâche) : amiante (1948–1997 surtout), plomb (avant 1948), plancher abîmé (vieux sols très usés), électricité hors normes (si l'électricité est à 1 ou 2 et pas refaite), humidité cachée. Le chantier s'arrête jusqu'à la décision (`works/hazard`) : **traiter** (coût et délai en plus), **reporter** (le poste est retiré, l'imprévu reviendra à coup sûr au prochain chantier sur ce poste) ou **passer en Éco** (traité, mais le poste en gamme Éco). Sans réponse sous 3 jours, l'imprévu est traité.
> - **Faire soi-même** : la peinture pour tout le monde, l'électricité pour le métier d'électricien ; seuls les matériaux sont payés (le prix moins la main-d'œuvre), le temps libre part chaque jour (5 h au plus) ; résultat : 5, 4 ou 3 selon le hasard (peinture 55/35/10 %, électricien 85/15 %).
> - **Logement occupé** : murs, portes, cuisine, WC, chauffage, fenêtres, ventilation, toiture, façade et jardin sont possibles avec un locataire (−1,2 point de satisfaction par jour de travaux) ; sols, salle de bain, électricité, plomberie et isolation exigent un logement vide (la mise en location est retirée et refusée pendant ces travaux).
> - **Artisans** : 8 métiers × 3 artisans fictifs à Dole : un bon marché et peu fiable, un moyen, un cher et très fiable ; ce dernier n'entre dans le carnet qu'après 2 chantiers terminés dans la ville. Les incidents de location appelés « artisan » passent par l'artisan le moins cher du métier.
> - **Usure** : chaque 1er janvier, un poste rénové (état 4 ou 5) peut perdre un état : 8 % par an en Éco, 4 % en Standard, 2 % en Premium, × un facteur par poste (les murs s'usent plus vite que l'isolation). L'usure s'arrête à l'état 3.
> - **Copropriété** : chaque appartement a un immeuble de 4 à 30 lots et un mois d'assemblée générale. Le 1er de ce mois, 1 ou 2 résolutions sont annoncées (ravalement, toiture, ascenseur, chaudière collective, cage d'escalier) avec la quote-part du joueur ; il vote (`copro/vote`, 2 h de temps libre une fois) ou laisse les autres décider ; son poids est 1 / nombre de lots. Une résolution votée lance un appel de fonds mensuel (6 à 24 mois), améliore les parties communes et parfois le DPE. Les verdicts humoristiques sont dans `content/textes/travaux.json`.

## Les prix de référence (point ouvert n° 2, octobre 2026)

> Prix TTC fournis et posés, par gamme, issus de guides de prix publiés en 2025-2026 (moyennes nationales). Le jeu applique un **indice de 0,95 pour Dole** (province, sous la moyenne nationale ; l'Île-de-France est 25 à 40 % au-dessus) et un facteur selon l'état du poste (1,25 pour un poste à refaire entièrement, 0,8 pour un poste presque neuf). La durée est en jours calendaires d'un artisan.
>
> | Poste | Base | Éco | Standard | Premium | Fourchettes publiées |
> |---|---|---|---|---|---|
> | Sols | m² de la pièce | 35 € (stratifié, vinyle) | 75 € (contrecollé, grès) | 140 € (massif, pierre) | parquet contrecollé posé 95–151 €/m² ; carrelage grès 40–70 €/m², pierre 80–150 €/m² |
> | Murs et plafonds | m² de la pièce (≈ 3,5 m² peints par m² au sol) | 70 € | 105 € | 170 € (ratissage, finitions) | peinture 20–35 €/m² de mur, plafond 30–45 €/m² |
> | Portes et placards | par pièce | 250 € | 550 € | 1 100 € | — (estimation) |
> | Cuisine équipée | forfait | 3 800 € | 8 500 € | 18 000 € | 2 500–4 500 € / 4 500–12 000 € / 12 500–25 000 € pose comprise |
> | Salle de bain | forfait (hors sols et murs) | 4 000 € | 7 500 € | 14 000 € | 4 500–8 000 € pour 5 m², haut de gamme bien au-delà |
> | WC | forfait | 450 € | 950 € (suspendu) | 1 900 € | — (estimation) |
> | Électricité | m² habitable + forfait | 400 € + 50 €/m² (mise en sécurité) | 800 € + 110 €/m² (réfection) | 1 500 € + 160 €/m² | mise aux normes 25–70 €/m² ; rénovation complète 80–200 €/m² |
> | Plomberie | m² habitable + forfait | 300 € + 40 €/m² | 600 € + 75 €/m² | 1 000 € + 105 €/m² | rénovation 70–90 €/m², installation complète 50–110 €/m² |
> | Chauffage | m² habitable + forfait | 800 € + 45 €/m² (radiateurs électriques) | 4 500 € + 50 €/m² (chaudière gaz à condensation et radiateurs) | 11 000 € + 60 €/m² (pompe à chaleur air-eau) | chaudière gaz posée ≈ 4 200 € ; PAC air-eau 10 000–16 000 € |
> | Isolation | m² de murs isolés (0,8 m² par m² habitable en appartement, 1,3 en maison) | 35 € | 70 € (ITI) | 140 € (ITI renforcée, ITE) | ITI 40–130 €/m² ; combles perdus 20–70 €/m² ; ITE 120–270 €/m² |
> | Fenêtres | par fenêtre (1 pour 11 m²) | 550 € | 900 € (PVC) | 1 500 € (bois, alu) | PVC 400–1 100 € (≈ 960 € en moyenne), bois 500–1 500 €, alu 600–2 300 € |
> | Ventilation | forfait | 1 200 € (simple flux) | 2 200 € (hygroréglable) | 6 500 € (double flux) | simple flux 500–3 500 € ; double flux 2 000–8 000 € |
> | Toiture | m² de toiture (0,8 par m² habitable) | 60 € (remaniement) | 150 € (tuiles mécaniques) | 230 € (tuiles plates, isolation) | réfection 130–260 €/m² |
> | Façade | m² de façade (1 par m² habitable) | 40 € (nettoyage, peinture) | 90 € (ravalement) | 190 € (ITE) | ravalement 40–150 €/m² ; avec ITE 120–270 €/m² |
> | Jardin | forfait | 1 500 € | 4 000 € | 10 000 € | — (estimation) |
>
> Ordres de grandeur obtenus : une rénovation complète Standard d'un appartement de 60 m² coûte environ 60 000 € (≈ 1 000 €/m²), un rafraîchissement (sols et murs) 6 000 à 11 000 €, une rénovation énergétique d'une passoire (isolation, fenêtres, chaudière) 15 000 à 20 000 € pour passer de F à C. Les publications donnent 150–200 €/m² pour un rafraîchissement, 1 000–2 000 €/m² pour une rénovation complète sans gros œuvre et 1 500–3 000 €/m² pour une rénovation lourde.
>
> **Imprévus** : amiante 400–800 € + 30–70 € par m² du poste, 7 à 15 jours (les tarifs publiés de désamiantage, 25–130 €/m², sont surtout belges) ; plomb 200–400 € + 15–35 €/m², 3 à 8 jours ; plancher 1 500–6 000 €, 5 à 15 jours ; mise en sécurité électrique 1 200–3 500 €, 2 à 6 jours ; humidité cachée 1 500–5 000 €, 7 à 20 jours.
>
> **Sources** (consultées en octobre 2026) : guides de prix de [La Maison Saint-Gobain](https://www.lamaisonsaintgobain.fr/guides-travaux/renovation-maison/quel-prix-pour-une-renovation-de-maison) (rénovation, [peinture](https://www.lamaisonsaintgobain.fr/guides-travaux/amenagement-interieur/prix-peinture-au-m2), [parquet](https://www.lamaisonsaintgobain.fr/guides-travaux/amenagement-interieur/prix-pose-parquet), [isolation par l'intérieur](https://www.lamaisonsaintgobain.fr/guides-travaux/isolation/prix-isolation-par-l-interieur-iti), [fenêtres](https://www.lamaisonsaintgobain.fr/guides-travaux/menuiseries-exterieures/prix-fenetre-double-vitrage)), [Obat](https://travaux.obat.fr/guides/prix-electricien) (électricien, [carrelage](https://travaux.obat.fr/guides/tarif-carreleur-m2/), [cuisine](https://travaux.obat.fr/guides/prix-cuisine-equipee)), [ABC Travaux](https://abctravaux.org/tarif-electricien-au-m%C2%B2-prix-2026-en-renovation-et-neuf/) (électricité, [toiture](https://abctravaux.org/prix-toiture-140m2/)), [IZI by EDF](https://izi-by-edf.fr/blog/renovation-electrique-quel-budget), [Travaux.com](https://www.travaux.com/cuisine/guide-des-prix/cuisine-1) (cuisine, [peinture](https://www.travaux.com/peinture/guide-des-prix/peinture-tva)), [Espace Aubade](https://www.espace-aubade.fr/blog/salle-de-bains/prix-renovation-salle-de-bain-5m2-budget-conseils-rbt.html) (salle de bain), [Prix-travaux-m2](https://www.prix-travaux-m2.com/prix-plomberie-m2.php) (plomberie), [Hello Watt](https://www.hellowatt.fr/pompe-a-chaleur/pompe-chaleur-air-eau/prix-pompe-chaleur-air-eau) (pompe à chaleur, isolation), [Prix-elec](https://prix-elec.com/renovation-energetique/chauffage/chaudiere/condensation-gaz) (chaudière gaz), [Quelle Énergie](https://www.quelleenergie.fr/prix-travaux/isolation) (isolation, [VMC](https://www.quelleenergie.fr/prix-travaux/equipements-annexes/vmc-simple-flux), [ravalement](https://www.quelleenergie.fr/prix-travaux/isolation/ravalement-facade)), [Selectra](https://selectra.info/energie/actualites/marche/changer-ses-fenetres-avant-hiver-cout-aides) (fenêtres, [VMC double flux](https://selectra.info/energie/renovation-energetique/vmc/double-flux)), [Habitatpresto](https://www.habitatpresto.com/mag/toiture/prix-toiture-neuve) (toiture), [Home Select](https://homeselect.paris/acheter-bien-immmobilier-travaux) et [Construires.fr](https://www.construires.fr/prix-renovation-maison/) (prix au m² de rénovation), [TrustUp](https://blog.trustup.be/fr/prix-desamiantage/) (désamiantage, prix belges).
>
> **Simplifications** (à connaître) :
> - prix **TTC uniques**, sans distinguer la TVA à 5,5 %, 10 % ou 20 % ; aucune aide (MaPrimeRénov', CEE, éco-prêt), comme le prévoit ce chapitre ;
> - un seul indice de prix par ville, pas de hausse des prix des travaux avec les années ;
> - une tâche par artisan et par phase, sans chevauchement fin ni météo ; un poste refait passe à 5 (ou 4) d'un coup, il n'y a pas de réparation partielle ;
> - les portes, placards, WC et jardin ont des prix estimés faute de source fiable ;
> - les quantités (murs à isoler, fenêtres, toiture, façade) sont tirées de la surface habitable par des ratios, pas d'une géométrie ;
> - le DPE est un modèle d'énergie primaire seul (pas d'étiquette climat, pas de seuils ajustés pour les petites surfaces) ;
> - un immeuble entier n'a qu'une électricité, une plomberie, un chauffage… pour tous ses appartements ;
> - en copropriété, le poids du joueur est 1 / nombre de lots (pas de tantièmes), un seul lot par immeuble, pas de fonds travaux obligatoire ni de syndic ;
> - les matériaux des travaux faits soi-même sont déductibles comme une facture d'artisan.

## La structure d'un bien

- **Des pièces** : entrée, séjour, cuisine, chambres, salle de bain, WC (et cave, combles, jardin pour une maison).
- Chaque pièce a **3 à 4 postes** : sols, murs, équipements (cuisine ou sanitaires), menuiseries.
- **Des éléments communs** à tout le logement : électricité, plomberie, chauffage, isolation, fenêtres, ventilation, et pour une maison ou un immeuble entier : toiture, façade.
- Chaque poste et chaque élément a un **état de 1 à 5** (1 = à refaire entièrement, 5 = neuf).
- L'état est **en partie caché** jusqu'à la visite ou au diagnostic (voir [03-marche-et-annonces.md](03-marche-et-annonces.md)).

## Les choix

- Pour chaque poste, une **gamme** : **Éco**, **Standard** ou **Premium**.

| Effet | Éco | Standard | Premium |
|---|---|---|---|
| Coût | bas | moyen | élevé |
| Durée | courte | moyenne | plus longue |
| Valeur ajoutée | faible | moyenne | forte (dans la limite du plafond du quartier) |
| Loyer possible | faible hausse | hausse | forte hausse |
| Durabilité | s'use vite | normale | longue |

- **Le DPE évolue** avec les éléments communs (isolation, fenêtres, chauffage, ventilation). Le jeu affiche la classe estimée **avant de valider** le chantier.
- **Le plafond du quartier** : du Premium dans un quartier modeste rapporte peu. C'est là que se joue la stratégie.
- Les **coûts de départ** (€/m² ou forfait par poste et par gamme) sont à calibrer sur des prix réels au jalon 3.

## Les artisans

- **Un artisan par corps de métier** : plombier, électricien, maçon, peintre, carreleur, menuisier, chauffagiste, cuisiniste.
- Chaque artisan a :
  - un **prix** (multiplicateur sur le coût de référence) ;
  - une **fiabilité** (respect des délais et du devis, qualité du résultat) ;
  - une **disponibilité** (file d'attente en jours) ;
  - une petite **personnalité** (« toujours là le lundi, jamais le vendredi »).
- **Le carnet d'artisans** est rangé par ville et s'enrichit au fil de la partie. La relation avec chaque artisan évolue légèrement (fidélité, priorité, remises), en plus simple que celle du banquier.
- **Les devis** : en demander un coûte 30 min de temps libre. Le coût réel peut s'écarter du devis selon la fiabilité de l'artisan et les imprévus.
- La réputation donne la priorité chez les meilleurs artisans.

## Le déroulement du chantier

- Le jeu **ordonne automatiquement** les interventions (électricité et plomberie avant les sols et la peinture, etc.) et affiche un **planning en frise**.
- Le joueur choisit les postes, les gammes et les artisans ; il ne réorganise pas le planning.
- **Imprévus** selon l'âge et l'état du bien :
  - amiante (biens construits avant 1997) ;
  - plomb dans les peintures (avant 1949) ;
  - poutre ou plancher abîmé ;
  - réseau électrique hors normes ;
  - humidité cachée.
  Chaque imprévu ajoute du coût et du délai, et peut demander une décision (traiter maintenant, reporter, changer de gamme).
- **Faire soi-même** :
  - la peinture est possible pour tout le monde ;
  - l'électricité seulement pour le métier d'électricien ;
  - c'est moins cher, mais ça coûte du temps libre chaque jour, et la qualité varie.
- **Logement occupé** : les petits travaux sont possibles avec un locataire en place (baisse temporaire de sa satisfaction). Les gros travaux exigent un logement vide.
- **Fin de chantier** : nouvel état des postes, nouveau DPE, nouvelle valeur estimée, nouvelle fourchette de loyer.

## Ce qui n'est pas inclus

- **Aucune aide à la rénovation** (prime, crédit d'impôt) : le jeu reste simple.
- Au **jalon 8** : un **maître d'œuvre** pour déléguer les gros chantiers, la **division** d'une maison en appartements, l'**aménagement des combles**.

> **Jalon 8, le maître d'œuvre** (`content/travaux.json`, `projectManager`) : on lui confie des postes (action `works/delegate`) ; il demande les devis aux artisans les plus fiables du carnet, les signe, traite les imprévus aussitôt (« traiter ») et ne prend aucun temps libre ; ses honoraires valent **10 %** du chantier. L'interface n'a pas encore d'écran de chantier : le bouton viendra avec lui.
>
> **Jalon 8, les transformations** (`packages/engine/src/systems/transformations.ts`, décision validée : un projet de transformation qui produit des lots à partir d'un bien), toujours menées par le maître d'œuvre, sur un bien vide et hors vente (action `works/transform`) :
>
> | Projet | Pour | Coût (avant honoraires, indice de ville compris) | Durée | Résultat |
> |---|---|---|---|---|
> | Division | maison de 110 m² ou plus | 850 €/m² + 4 000 € par appartement | 6 mois | 2 à 4 appartements d'environ 45 m², refaits à neuf, **chacun possédé, loué et vendu séparément** |
> | Vente à la découpe | immeuble de rapport | 3 500 € par appartement + 1 % de la valeur | 3 mois | ses appartements, dans l'état de leurs pièces, sans la décote de 15 % d'un immeuble vendu en bloc |
> | Combles | maison qui en a | 1 300 €/m² aménagé | 4 mois | la surface des combles en plus et une chambre |
> | Construction | terrain de 300 m² ou plus | 1 750 €/m² construit | 10 mois | une maison neuve (25 % du terrain, 80 à 150 m²), classe A |
>
> - Un acompte de 30 % au départ, le solde à la fin, avec un **dépassement caché** (35 % de chance, de 5 à 20 %). Le coût compte dans la plus-value, pas dans les charges déductibles des loyers.
> - Une division ou une découpe répartit le prix d'achat, les frais et les travaux entre les appartements selon leur surface ; le prêt suit le premier appartement (il est remboursé quand celui-ci est vendu), l'enveloppe travaux aussi.
> - On ne divise pas la maison où l'on habite (on peut en aménager les combles).
> - Le titre **Promoteur** demande une transformation terminée (chapitre 2.9).
> - Marges mesurées sur les annonces du départ (valeur après, moins 1,2 fois le coût, rapportée au prix) : la découpe et la construction rapportent souvent un peu, les combles sont proches de l'équilibre, la division d'une maison ne paie que sur une bonne affaire. Revendre aussitôt rapporte peu à un particulier (frais d'agence, plus-value imposée à 36 % avant 5 ans) : le statut de marchand de biens n'est pas modélisé.

## La copropriété (version simple)

- Les **charges de copropriété** sont prélevées chaque mois.
- **Une assemblée générale par an** pour chaque immeuble où le joueur possède un lot :
  - une notification présente **1 ou 2 résolutions** (ravalement, toiture, ascenseur, chaudière collective) ;
  - le joueur vote **Pour** ou **Contre** ;
  - son poids dépend de la part de l'immeuble qu'il possède ;
  - s'il n'y va pas (gain de 2 h de temps libre), les autres décident pour lui.
- Le résultat est annoncé avec humour (« M. Grosjean, du 2e, a voté contre, comme chaque année depuis 1987 »).
- Un vote positif déclenche un **appel de fonds** étalé sur plusieurs mois, et améliore l'état des parties communes (donc la valeur et parfois le DPE).
- Avec **un immeuble entier**, il n'y a plus de copropriété : le joueur décide seul des travaux des parties communes.
