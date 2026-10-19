import type { CityConfig } from '../src/config.ts';

/**
 * Dijon (Côte-d'Or). Neighbourhoods are groupings of INSEE IRIS chosen from general knowledge of
 * the city, NOT checked on site (docs/10-points-ouverts.md): names and groupings may be adjusted.
 * Industrial and commercial zones are left out.
 */
export const dijon: CityConfig = {
  id: 'dijon',
  name: 'Dijon',
  inseeCode: '21231',
  neighbourhoods: [
    {
      id: 'centreHistorique',
      name: 'Centre historique',
      iris: [
        '212310101',
        '212310102',
        '212310103',
        '212310201',
        '212310202',
        '212310301',
        '212310302',
      ],
    },
    {
      id: 'montchapetRepublique',
      name: 'Montchapet – République',
      iris: ['212310303', '212310304', '212310305', '212311501', '212311502', '212311503'],
    },
    {
      id: 'universiteVoltaire',
      name: 'Université – Voltaire',
      iris: [
        '212310401',
        '212310402',
        '212310403',
        '212310404',
        '212310501',
        '212310502',
        '212310503',
        '212310601',
      ],
    },
    {
      id: 'gareArsenal',
      name: 'Gare – Arsenal',
      iris: [
        '212310701',
        '212310702',
        '212310703',
        '212310704',
        '212310801',
        '212310802',
        '212310803',
        '212310804',
        '212310901',
        '212311301',
        '212311302',
        '212311303',
        '212319803',
      ],
    },
    {
      id: 'bourrochesLarrey',
      name: 'Bourroches – Larrey',
      iris: [
        '212311001',
        '212311002',
        '212311003',
        '212311004',
        '212311005',
        '212311006',
        '212311101',
        '212311401',
        '212311402',
      ],
    },
    {
      id: 'lacFontaineDOuche',
      name: "Le Lac – Fontaine d'Ouche",
      iris: [
        '212311201',
        '212311202',
        '212311203',
        '212311204',
        '212311601',
        '212311602',
        '212311603',
        '212311604',
      ],
    },
    {
      id: 'gresillesStalingrad',
      name: 'Les Grésilles – Stalingrad',
      iris: [
        '212311701',
        '212311702',
        '212311703',
        '212311704',
        '212311801',
        '212311802',
        '212311803',
        '212311804',
      ],
    },
    {
      id: 'toisonDOr',
      name: "Charles de Gaulle – Toison d'Or",
      iris: ['212312001', '212312002', '212312003', '212319801'],
    },
  ],
  excludedIris: ['212319802', '212319804', '212319901'],
  landmarks: [
    { id: 'ducs', name: 'Palais des ducs', search: 'Palais des Ducs' },
    { id: 'gare', name: 'Gare de Dijon-Ville', search: 'Gare de Dijon' },
  ],
};
