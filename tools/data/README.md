# Scripts de données

Scripts qui produisent les fichiers de `data/` à partir des sources publiques. Voir [`docs/06-donnees.md`](../../docs/06-donnees.md).

```sh
pnpm --filter @cle/data-tools build-city dole
```

- Les téléchargements sont mis en cache dans `tools/data/.cache/` (ignoré par git) : relancer le script ne retélécharge rien. Supprimer ce dossier pour repartir des sources.
- Les fichiers DVF nationaux (environ 80 Mo chacun) sont lus en flux ; seules les lignes de la commune sont gardées.
- Le script passe par le proxy de l'environnement s'il existe (`NODE_USE_ENV_PROXY=1`).

| Fichier | Rôle |
|---|---|
| `cities/<ville>.ts` | Choix écrits à la main : quartiers (liste des IRIS), IRIS exclus, repères de la carte |
| `src/config.ts` | Adresses et millésimes des sources (à mettre à jour chaque année) |
| `src/sources/` | Un module par source : DVF, carte des loyers, DPE (ADEME), IRIS et cadastre (IGN), BD TOPO (IGN), commune (geo.api.gouv.fr) |
| `src/aggregate.ts` | Statistiques (quantiles, tendances, lissage des petits échantillons) |
| `src/build-city.ts` | Assemble `data/cities/<ville>.json` et le valide avec le schéma `content/schemas/city.ts` |

Ajouter une ville (exemples : `cities/dijon.ts`, `cities/besancon.ts`, `cities/chalon-sur-saone.ts`) :

1. lister les IRIS de la commune (`loadIris`) et écrire `cities/<ville>.ts` : quartiers, IRIS exclus, repères de la carte (leur nom doit exister dans la BD TOPO) ;
2. la déclarer dans `CITIES` (`src/build-city.ts`) et lancer le script ;
3. déclarer le fichier produit dans `dataRegistry` (`content/registry.ts`) et l'importer dans `content/index.ts` ;
4. écrire le contenu de la ville : trajets, position, texte, part d'annonces et demande dans `content/villes.json`, indice de coût des travaux dans `content/travaux.json`, rues de chaque quartier dans `content/monde.json`, au moins un artisan par poste dans `content/artisans.json` (`pnpm validate-content` signale ce qui manque).
