/** What a city file is built from: hand-written choices, everything else comes from the data. */
export interface CityConfig {
  id: string;
  name: string;
  /** INSEE commune code (also the DVF and DPE commune key). */
  inseeCode: string;
  neighbourhoods: { id: string; name: string; iris: string[] }[];
  /** IRIS without housing worth simulating (industrial zones). */
  excludedIris: string[];
  /** Landmarks drawn on the map, found by name in the BD TOPO. */
  landmarks: { id: string; name: string; search: string }[];
}

/** Public sources, with the vintage used. Update the URLs for a yearly refresh. */
export const SOURCES = {
  dvf: {
    label: 'DVF (DGFiP, data.gouv.fr)',
    files: [
      'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20261012-171609/valeursfoncieres-2021-s2.txt.zip',
      'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20261012-171615/valeursfoncieres-2022.txt.zip',
      'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20261012-171627/valeursfoncieres-2023.txt.zip',
      'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20261012-171636/valeursfoncieres-2024.txt.zip',
      'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20261012-171642/valeursfoncieres-2025.txt.zip',
      'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20261012-171648/valeursfoncieres-2026-s1.txt.zip',
    ],
    /** Sales from this date on (first day of the oldest file). */
    from: '2021-07-01',
    to: '2026-06-30',
  },
  rents: {
    label: 'Carte des loyers 2025 (ANIL, ministère du Logement)',
    year: 2025,
    apartment:
      'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145010/pred-app-mef-dhup.csv',
    smallApartment:
      'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-144934/pred-app12-mef-dhup.csv',
    largeApartment:
      'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-144951/pred-app3-mef-dhup.csv',
    house:
      'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/20251211-145039/pred-mai-mef-dhup.csv',
  },
  dpe: {
    label: 'DPE des logements existants (ADEME)',
    dataset: 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines',
  },
  iris: { label: 'Contours IRIS (IGN, INSEE)', layer: 'STATISTICALUNITS.IRIS:contours_iris' },
  cadastre: {
    label: 'Parcellaire Express (IGN)',
    layer: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle',
  },
  population: { label: 'Populations légales (INSEE, geo.api.gouv.fr)' },
  map: { label: 'BD TOPO (IGN)' },
} as const;
