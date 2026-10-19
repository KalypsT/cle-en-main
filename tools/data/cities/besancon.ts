import type { CityConfig } from '../src/config.ts';

/**
 * Besançon (Doubs). Neighbourhoods are groupings of INSEE IRIS chosen from general knowledge of
 * the city, NOT checked on site (docs/10-points-ouverts.md): names and groupings may be adjusted.
 * Tilleroyes and Chailluz (forest) are left out.
 */
export const besancon: CityConfig = {
  id: 'besancon',
  name: 'Besançon',
  inseeCode: '25056',
  neighbourhoods: [
    {
      id: 'centreAncien',
      name: 'Centre ancien',
      iris: ['250560101', '250560102', '250560103', '250560104', '250560401', '250560402'],
    },
    {
      id: 'chapraisMouillere',
      name: 'Chaprais – Mouillère',
      iris: ['250560501', '250560502', '250560503', '250560504', '250560505', '250560506'],
    },
    {
      id: 'montrapon',
      name: 'Saint-Ferjeux – Montrapon',
      iris: [
        '250560701',
        '250560702',
        '250560703',
        '250560801',
        '250560802',
        '250560803',
        '250560804',
        '250560805',
      ],
    },
    {
      id: 'grettBregille',
      name: 'Grette – Bregille',
      iris: [
        '250560105',
        '250560201',
        '250560301',
        '250560302',
        '250560303',
        '250560304',
        '250560601',
      ],
    },
    {
      id: 'viotteVesoul',
      name: 'Viotte – Rue de Vesoul',
      iris: ['250560901', '250560902', '250560903', '250560904', '250560905'],
    },
    {
      id: 'palenteSaragosse',
      name: 'Palente – Saragosse',
      iris: [
        '250561001',
        '250561002',
        '250561003',
        '250561004',
        '250561005',
        '250561101',
        '250561104',
        '250561105',
      ],
    },
    {
      id: 'planoise',
      name: 'Planoise',
      iris: [
        '250561201',
        '250561202',
        '250561203',
        '250561204',
        '250561205',
        '250561206',
        '250561207',
        '250561208',
        '250561209',
        '250561210',
      ],
    },
  ],
  excludedIris: ['250561301', '250561401'],
  landmarks: [
    { id: 'citadelle', name: 'Citadelle', search: 'Citadelle' },
    { id: 'gare', name: 'Gare de Besançon-Viotte', search: 'Gare de Besançon' },
  ],
};
