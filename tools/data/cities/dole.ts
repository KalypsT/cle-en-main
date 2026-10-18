import type { CityConfig } from '../src/config.ts';

/**
 * Dole (Jura). Neighbourhoods validated on 2026-10-18 (docs/10-points-ouverts.md):
 * each one groups INSEE IRIS; the northern industrial zone is left out.
 */
export const dole: CityConfig = {
  id: 'dole',
  name: 'Dole',
  inseeCode: '39198',
  neighbourhoods: [
    {
      id: 'centreHistorique',
      name: 'Centre historique',
      iris: ['391980105', '391980106', '391980107', '391980115'],
    },
    {
      id: 'mesnilsPasteur',
      name: 'Les Mesnils Pasteur',
      iris: ['391980113', '391980114'],
    },
    { id: 'paters', name: 'Les Paters', iris: ['391980102', '391980104'] },
    { id: 'plumontValFleuri', name: 'Plumont – Val Fleuri', iris: ['391980108'] },
    { id: 'azans', name: 'Azans', iris: ['391980109', '391980110', '391980111', '391980112'] },
  ],
  excludedIris: ['391980101'],
  landmarks: [
    { id: 'collegiale', name: 'Collégiale Notre-Dame', search: 'Collégiale Notre-Dame de Dole' },
    { id: 'gare', name: 'Gare de Dole-Ville', search: 'Gare de Dole Ville' },
  ],
};
