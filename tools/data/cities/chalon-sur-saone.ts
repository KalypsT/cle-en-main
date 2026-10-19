import type { CityConfig } from '../src/config.ts';

/**
 * Chalon-sur-Saône (Saône-et-Loire). Neighbourhoods are groupings of INSEE IRIS chosen from
 * general knowledge of the city, NOT checked on site (docs/10-points-ouverts.md): names and
 * groupings may be adjusted. Industrial zones are left out.
 */
export const chalonSurSaone: CityConfig = {
  id: 'chalon',
  name: 'Chalon-sur-Saône',
  inseeCode: '71076',
  neighbourhoods: [
    {
      id: 'centreSaintLaurent',
      name: 'Centre – Île Saint-Laurent',
      iris: ['710760113', '710760115', '710760116', '710760117', '710760118'],
    },
    {
      id: 'saintCosmeBellevue',
      name: 'Saint-Cosme – Bellevue',
      iris: ['710760112', '710760119', '710760120'],
    },
    {
      id: 'presSaintJean',
      name: 'Les Prés Saint-Jean',
      iris: ['710760107', '710760108', '710760109', '710760110'],
    },
    {
      id: 'saintJeanDesVignes',
      name: 'Saint-Jean-des-Vignes',
      iris: ['710760104', '710760105', '710760106'],
    },
    {
      id: 'stadeFontaineAuxLoups',
      name: 'Le Stade – Fontaine aux Loups',
      iris: ['710760101', '710760102', '710760103'],
    },
    {
      id: 'champFleuriVerrerie',
      name: 'Champ Fleuri – Verrerie',
      iris: ['710760111', '710760114'],
    },
  ],
  excludedIris: ['710760197', '710760198', '710760199'],
  landmarks: [
    { id: 'cathedrale', name: 'Cathédrale Saint-Vincent', search: 'Cathédrale Saint-Vincent' },
    { id: 'gare', name: 'Gare de Chalon-sur-Saône', search: 'Gare de Chalon' },
  ],
};
