import { describe, expect, it } from 'vitest';
import { binCounts, quantile, shares, shrink, trendPercentPerYear, yearOf } from './aggregate.ts';
import { lambert93ToWgs84, pointInRing, simplify } from './geo.ts';
import { parseSales } from './sources/dvf.ts';

describe('aggregate', () => {
  it('computes quantiles with interpolation', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.9)).toBe(5);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('pulls small samples towards the reference', () => {
    expect(shrink(1000, 10, 2000, 10)).toBe(1500);
    expect(shrink(1000, 0, 2000, 10)).toBe(2000);
  });

  it('builds shares that sum to exactly one', () => {
    const result = shares(['a', 'b', 'c'], { a: 1, b: 1, c: 1 }, null, 0);
    expect(result.a + result.b + result.c).toBeCloseTo(1, 9);
    const blended = shares(['a', 'b'], { a: 10 }, { a: 0, b: 1 }, 10);
    expect(blended).toEqual({ a: 0.5, b: 0.5 });
  });

  it('measures a yearly trend independently of the mix of kinds', () => {
    const sales = [2020, 2021, 2022].flatMap((year) => [
      { group: 'flat', year, perM2: 1000 * 1.05 ** (year - 2020) },
      { group: 'house', year, perM2: 3000 * 1.05 ** (year - 2020) },
    ]);
    expect(trendPercentPerYear(sales)).toBeCloseTo(5, 6);
    expect(yearOf('2024-07-01')).toBeCloseTo(2024.5, 6);
  });

  it('bins values with an inclusive last edge', () => {
    expect(binCounts([10, 20, 30, 40], [10, 20, 40])).toEqual([1, 3]);
  });
});

describe('geo', () => {
  it('tests points against rings and simplifies lines', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    expect(pointInRing([5, 5], [...square])).toBe(true);
    expect(pointInRing([15, 5], [...square])).toBe(false);
    expect(
      simplify(
        [
          [0, 0],
          [5, 0.1],
          [10, 0],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it('converts Lambert-93 to WGS84', () => {
    const [lon, lat] = lambert93ToWgs84(700000, 6600000);
    expect(lon).toBeCloseTo(3, 6);
    expect(lat).toBeCloseTo(46.5, 6);
  });
});

describe('DVF parsing', () => {
  const header =
    'Identifiant de document|Reference document|Date mutation|Nature mutation|Valeur fonciere|Code departement|Code commune|Prefixe de section|Section|No plan|Code type local|Surface reelle bati|Nombre pieces principales|Surface terrain';
  it('keeps single-dwelling sales and merges their culture lines', () => {
    const lines = [
      '||01/02/2024|Vente|150000,00|39|198||AB|12|1|90|4|300',
      '||01/02/2024|Vente|150000,00|39|198||AB|12|1|90|4|200',
      '||01/02/2024|Vente|150000,00|39|198||AB|12|3|||0',
      '||05/03/2024|Vente|200000,00|39|198||AC|1|2|50|2|0',
      '||05/03/2024|Vente|200000,00|39|198||AC|1|2|60|3|0',
      '||06/03/2024|Echange|90000,00|39|198||AC|2|2|40|2|0',
    ];
    expect(parseSales(header, lines)).toEqual([
      {
        date: '2024-02-01',
        price: 150000,
        type: 'house',
        surface: 90,
        rooms: 4,
        landSurface: 500,
        parcel: '39198000AB0012',
      },
    ]);
  });
});
