import { SOURCES } from '../config.ts';
import { download } from '../http.ts';

/** Asking rent per m² (charges included) of one dwelling kind in a commune, with its interval. */
export interface RentIndicator {
  perM2: number;
  low: number;
  high: number;
  /** Ads observed in the commune itself (the model borrows from neighbours below ~30). */
  observations: number;
}

async function indicator(url: string, inseeCode: string): Promise<RentIndicator> {
  // The files are published in Windows-1252 with French decimal commas.
  const text = new TextDecoder('windows-1252').decode(await download(url));
  const [headerLine, ...rows] = text.split(/\r?\n/);
  const header = (headerLine ?? '').split(';').map((cell) => cell.replaceAll('"', ''));
  const index = (name: string) => header.indexOf(name);
  for (const row of rows) {
    const cells = row.split(';').map((cell) => cell.replaceAll('"', ''));
    if (cells[index('INSEE_C')] !== inseeCode) continue;
    const value = (name: string) => Number((cells[index(name)] ?? '').replace(',', '.'));
    return {
      perM2: value('loypredm2'),
      low: value('lwr.IPm2'),
      high: value('upr.IPm2'),
      observations: value('nbobs_com'),
    };
  }
  throw new Error(`No rent indicator for ${inseeCode} in ${url}`);
}

export async function loadRents(inseeCode: string) {
  const { rents } = SOURCES;
  return {
    apartment: await indicator(rents.apartment, inseeCode),
    smallApartment: await indicator(rents.smallApartment, inseeCode),
    largeApartment: await indicator(rents.largeApartment, inseeCode),
    house: await indicator(rents.house, inseeCode),
  };
}
