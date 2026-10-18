# 3.7 Événements et rythme

## Le rôle des événements

Les événements font vivre la simulation et maintiennent un **flux régulier de décisions**. Objectif mesuré par les bots : **une décision intéressante en moyenne toutes les 30 à 60 secondes réelles** à vitesse ×1.

## Les familles d'événements

| Famille | Exemples |
|---|---|
| **Marché** | Nouvelle annonce, baisse de prix, bien hors marché, enchère judiciaire, offre d'un rival |
| **Locataires** | Candidature, incident, retard de loyer, préavis, événement de vie |
| **Artisans** | Devis reçu, retard, imprévu de chantier, fin de chantier |
| **Banque** | Variation du taux, proposition de renégociation, rendez-vous, refus de prêt |
| **Copropriété** | Assemblée générale, appel de fonds, sinistre dans les parties communes |
| **Ville** | Arrivée d'un tramway, fermeture d'usine, rénovation urbaine, nouvelle école |
| **France** | Hausse ou baisse des taux, crise, nouvelle loi (fictive mais crédible) |
| **Anecdotes** | Un locataire envoie la photo de son chat, un artisan raconte ses vacances |

## Fréquences

- Les événements courants dépendent de l'état du patrimoine (plus de biens, plus d'événements).
- **Les grands événements nationaux** sont **rares mais marquants** : environ une fois tous les 5 à 10 ans de jeu (crise de type 2008, choc de taux, réforme importante).
- **Les anecdotes** n'ont aucun enjeu : elles apparaissent en bulles dans la rue ou dans un fil d'actualité, pour la vie et l'humour.
- **Les défis** (voir [02-boucle-et-progression.md](../02-boucle-et-progression.md#210-succès-défis-chronique-et-statistiques)) : 2 ou 3 par an de jeu, jamais deux en même temps.

## La boîte de décisions

- Toute décision a une **échéance** (une annonce qui expire, un candidat qui attend, une offre à laquelle répondre).
- Rien n'est bloquant, mais une décision qui attend trop est **perdue** (l'événement suit son cours par défaut).
- Les décisions importantes déclenchent la **pause automatique**.

## Événements décrits en données

Chaque événement est un objet JSON dans `content/evenements/` (un fichier par famille : `marche`, `locataires`, `artisans`, `banque`, `copropriete`, `ville`, `france`), validé par un schéma zod (`content/schemas/events.ts`). Format arrêté au jalon 6 (point ouvert n° 8) :

```json
{
  "id": "bathroomMould",
  "family": "tenants",
  "target": "lease",
  "kind": "mishap",
  "conditions": { "item": { "kind": "ventilation", "maxState": 2 } },
  "chancePerMonth": 0.06,
  "cooldownDays": 365,
  "pause": false,
  "texts": ["{locataire} envoie des photos : des moisissures noires gagnent le plafond de la salle de bains de {bien}."],
  "choices": [
    { "id": "vmc", "label": "Installer une VMC ({montant})", "effects": [{ "type": "money", "euros": { "min": -900, "max": -500 } }, { "type": "item", "item": "ventilation", "set": 4 }, { "type": "satisfaction", "delta": 8 }], "outcome": "L'air circule enfin." },
    { "id": "bleach", "label": "Passer à l'eau de Javel soi-même (1 h)", "effects": [{ "type": "freeTime", "minutes": 60 }, { "type": "satisfaction", "delta": -2 }] },
    { "id": "ignore", "label": "Ignorer", "effects": [{ "type": "satisfaction", "delta": -10 }, { "type": "reputation", "delta": -1 }] }
  ],
  "deadlineDays": 4,
  "defaultChoice": "ignore"
}
```

- **Cible** (`target`) : rien (`none`), un bien loué (`lease`), un bien possédé hors résidence principale (`owned`), un bien vide (`vacant`), un appartement en copropriété (`copro`), un bien en chantier (`works`).
- **Vocabulaire fermé de conditions** : mois, métiers, salarié ou non, locataire de sa résidence, crédit en cours, conditions sur les statistiques (les mêmes que les titres et les succès) ; sur la cible : état maximal d'un poste, type de bail, classes DPE, type de bien, fourchette de satisfaction du locataire.
- **Vocabulaire fermé d'effets** (montants signés : négatif = dépense) : argent (fourchette en euros tirée quand l'événement arrive, ou part du loyer), réputation, satisfaction, confiance d'un banquier, état d'un poste (le plus usé du type), temps libre consommé (le choix le demande), préavis du locataire, variation du loyer, niveau ou tendance des prix d'un quartier, d'une ville ou de toute la France, taux du marché, bien hors marché proposé, retard ou avance d'un chantier.
- Un événement a **soit des effets immédiats** (simple nouvelle), **soit au moins deux choix**, une échéance et un **choix par défaut** appliqué si le joueur ne répond pas.
- **Chance par mois**, pour chaque cible possible (une seule fois pour `none`) ; les événements `mishap` sont multipliés par le coefficient d'incidents du mode. **Délai** avant qu'un même événement revienne. Au plus 3 événements en attente et 1 nouveau par jour (`content/rythme.json`).
- **Textes** avec variantes et variables : `{bien}`, `{locataire}`, `{quartier}`, `{ville}`, `{artisan}` (tiré du métier `artisanTrade`), `{banquier}`, `{rival}`, `{montant}` (le montant du choix).
- Les grands événements nationaux (`france`, `major`) vont dans la chronique.
- **Catalogue du jalon 6** : 107 événements à enjeu (16 marché, 26 locataires, 15 artisans, 13 banque, 13 copropriété, 16 ville, 8 France), en plus des incidents et événements de vie des locataires et des imprévus de chantier déjà codés aux jalons 2 et 3. Les fréquences ont été calées par les bots sur la densité de décisions (voir [08-equilibrage.md](../08-equilibrage.md)).
- **Simplification** : l'argent d'un événement passe directement sur le compte courant ; il n'apparaît pas dans les lignes du bilan mensuel ni dans les charges déductibles.

> **Anecdotes** (`content/anecdotes.json`, 54) : locataires, voisins, artisans, banquiers, rivaux, ville ; une chance de 30 % par jour, sans effet. Elles arrivent dans le fil d'actualité et, pendant 3 jours, en bulle « … » sur le bâtiment concerné de la rue.
>
> **Défis** : voir [02-boucle-et-progression.md](../02-boucle-et-progression.md#210-succès-défis-chronique-et-statistiques) ; ils apparaissent dans la boîte de décisions et mettent le jeu en pause.

- On peut **ajouter des événements sans toucher au code** ; `pnpm validate-content` vérifie le schéma et les références (banques, rivaux, métiers, effets compatibles avec la cible).
- Les bots vérifient qu'un nouvel événement ne casse pas l'équilibre : ils répondent aux événements par leur choix par défaut, tout de suite.

## Le rythme sans idle

- **Le temps libre est perdu chaque soir** : il pousse à agir chaque jour.
- **L'accélération automatique** supprime l'attente quand il n'y a rien à faire.
- **Les bilans** (mensuel court, annuel complet) donnent des points de respiration et de satisfaction.
- **Test anti-idle** : un bot qui ne fait rien ne doit jamais s'enrichir (voir [08-equilibrage.md](../08-equilibrage.md)).
