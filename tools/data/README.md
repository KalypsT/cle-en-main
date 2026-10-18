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

Ajouter une ville : écrire `cities/<ville>.ts`, la déclarer dans `CITIES` (`src/build-city.ts`) et dans `dataRegistry` (`content/registry.ts`), puis lancer le script.
