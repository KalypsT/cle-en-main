import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Unzip, UnzipInflate } from 'fflate';
import { SOURCES } from '../config.ts';
import { CACHE_DIR, download } from '../http.ts';

/** One dwelling sold alone (with its outbuildings), from the raw DVF files. */
export interface DvfSale {
  date: string;
  price: number;
  type: 'apartment' | 'house';
  /** Living area in m² (surface réelle bâtie). */
  surface: number;
  rooms: number;
  landSurface: number;
  /** Cadastral parcel identifier (IDU), used to place the sale in an IRIS. */
  parcel: string;
}

/** Streams a national zip and keeps the lines of one commune. */
async function extractCommuneLines(url: string, department: string, commune: string) {
  const zip = await download(url);
  const decoder = new TextDecoder('utf-8');
  const lines: string[] = [];
  let header = '';
  let rest = '';
  const marker = `|${department}|${commune}|`;
  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip((file) => {
      file.ondata = (error, chunk, final) => {
        if (error) return reject(error);
        const text = rest + decoder.decode(chunk, { stream: !final });
        const parts = text.split('\n');
        rest = parts.pop() ?? '';
        for (const line of parts) {
          if (!header) header = line;
          else if (line.includes(marker)) lines.push(line);
        }
        if (final) resolve();
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    // Small slices keep each decompressed chunk well below the string size limit.
    const slice = 1 << 20;
    for (let offset = 0; offset < zip.length; offset += slice) {
      unzip.push(zip.subarray(offset, offset + slice), offset + slice >= zip.length);
    }
  });
  return { header: header.trim(), lines };
}

const num = (value: string | undefined) => Number((value ?? '').replace(',', '.')) || 0;

function toIsoDate(french: string): string {
  const [day, month, year] = french.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Raw DVF has one line per (lot, local, culture): lines are grouped back into
 * mutations by document, date and price. Only plain sales of exactly one house
 * or apartment are kept, so that price / surface is meaningful.
 */
export function parseSales(header: string, lines: readonly string[]): DvfSale[] {
  const columns = header.split('|');
  const col = (name: string) => {
    const index = columns.indexOf(name);
    if (index < 0) throw new Error(`DVF column not found: ${name}`);
    return index;
  };
  const c = {
    date: col('Date mutation'),
    nature: col('Nature mutation'),
    price: col('Valeur fonciere'),
    department: col('Code departement'),
    commune: col('Code commune'),
    prefix: col('Prefixe de section'),
    section: col('Section'),
    plan: col('No plan'),
    typeCode: col('Code type local'),
    surface: col('Surface reelle bati'),
    rooms: col('Nombre pieces principales'),
    land: col('Surface terrain'),
  };
  const mutations = new Map<string, string[][]>();
  for (const line of lines) {
    const f = line.split('|');
    const key = [f[0], f[1], f[c.date], f[c.price]].join('|');
    const group = mutations.get(key);
    if (group) group.push(f);
    else mutations.set(key, [f]);
  }
  const sales: DvfSale[] = [];
  for (const rows of mutations.values()) {
    const first = rows[0];
    if (!first || first[c.nature] !== 'Vente') continue;
    // Each local appears once per culture line: deduplicate by local fields.
    const dwellings = new Map<string, string[]>();
    let other = false;
    for (const row of rows) {
      const code = row[c.typeCode];
      if (code === '1' || code === '2') {
        dwellings.set([row[c.typeCode], row[c.surface], row[c.rooms], row[c.plan]].join('|'), row);
      } else if (code === '4') other = true; // commercial premises
    }
    if (dwellings.size !== 1 || other) continue;
    const [dwelling] = dwellings.values();
    if (!dwelling) continue;
    const land = new Set(rows.map((row) => `${row[c.plan]}|${row[c.land]}`));
    const department = dwelling[c.department] ?? '';
    const commune = (dwelling[c.commune] ?? '').padStart(3, '0');
    const prefix = (dwelling[c.prefix] || '000').padStart(3, '0');
    const section = (dwelling[c.section] ?? '').padStart(2, '0');
    const plan = (dwelling[c.plan] ?? '').padStart(4, '0');
    sales.push({
      date: toIsoDate(first[c.date] ?? ''),
      price: num(first[c.price]),
      type: dwelling[c.typeCode] === '1' ? 'house' : 'apartment',
      surface: num(dwelling[c.surface]),
      rooms: num(dwelling[c.rooms]),
      landSurface: [...land].reduce((sum, entry) => sum + num(entry.split('|')[1]), 0),
      parcel: `${department}${commune}${prefix}${section}${plan}`,
    });
  }
  return sales.sort((a, b) => a.date.localeCompare(b.date) || a.price - b.price);
}

/** All single-dwelling sales of a commune over the DVF period. */
export async function loadDvfSales(inseeCode: string): Promise<DvfSale[]> {
  const cached = join(CACHE_DIR, `dvf-${inseeCode}.json`);
  try {
    return JSON.parse(await readFile(cached, 'utf8')) as DvfSale[];
  } catch {
    // Not extracted yet.
  }
  const department = inseeCode.slice(0, 2);
  const commune = String(Number(inseeCode.slice(2)));
  const sales: DvfSale[] = [];
  for (const url of SOURCES.dvf.files) {
    console.log(`  DVF ${url.split('/').at(-1)}`);
    const { header, lines } = await extractCommuneLines(url, department, commune);
    sales.push(...parseSales(header, lines));
  }
  await writeFile(cached, JSON.stringify(sales));
  return sales;
}
