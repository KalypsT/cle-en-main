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

Chaque événement est un objet JSON dans `content/events/`, validé par un schéma :

```json
{
  "id": "locataire.chauffe_eau_panne",
  "famille": "locataires",
  "conditions": { "bien.loue": true, "bien.poste.plomberie.etat_max": 3 },
  "probabilite_par_mois": 0.04,
  "pause": true,
  "echeance_jours": 3,
  "texte": "Le chauffe-eau de {bien.nom} a rendu l'âme. {locataire.prenom} prend des douches froides depuis hier.",
  "choix": [
    { "id": "reparer", "label": "Réparer ({cout} €)", "effets": { "argent": -180, "locataire.satisfaction": 5, "bien.poste.plomberie.etat": "+1" } },
    { "id": "remplacer", "label": "Remplacer ({cout} €)", "effets": { "argent": -620, "locataire.satisfaction": 10, "bien.poste.plomberie.etat": 5 } },
    { "id": "attendre", "label": "Attendre", "effets": { "locataire.satisfaction_par_jour": -4 } }
  ]
}
```

(Format indicatif, à définir précisément au jalon 6.)

- On peut **ajouter des événements sans toucher au code**.
- Les bots vérifient qu'un nouvel événement ne casse pas l'équilibre.
- Les textes utilisent des **variables** et des **variantes** pour éviter la répétition.

## Le rythme sans idle

- **Le temps libre est perdu chaque soir** : il pousse à agir chaque jour.
- **L'accélération automatique** supprime l'attente quand il n'y a rien à faire.
- **Les bilans** (mensuel court, annuel complet) donnent des points de respiration et de satisfaction.
- **Test anti-idle** : un bot qui ne fait rien ne doit jamais s'enrichir (voir [08-equilibrage.md](../08-equilibrage.md)).
