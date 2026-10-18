# Données générées

Fichiers **générés** par les scripts de `tools/data/` à partir des données publiques (DVF, carte des loyers, DPE, IRIS, cadastre, BD TOPO). On ne les modifie pas à la main : on relance le script (`pnpm --filter @cle/data-tools build-city <ville>`).

- `cities/<ville>.json` : quartiers (IRIS, contours), prix au m², volumes de ventes, surfaces, époques, DPE, loyers, éléments de carte. Schéma : `content/schemas/city.ts`, vérifié par `pnpm validate-content`.

Voir [`docs/06-donnees.md`](../docs/06-donnees.md).
