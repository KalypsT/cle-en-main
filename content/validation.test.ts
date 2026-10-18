import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jobs, timeSettings, uiTexts } from './index.ts';
import { validateContentDirectory, validateContentText } from './validation.ts';

const schema = z.object({ name: z.string() }).strict();
let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('content', () => {
  it('ships valid content', async () => {
    const { problems } = await validateContentDirectory(import.meta.dirname);
    expect(problems).toEqual([]);
    expect(jobs.length).toBeGreaterThan(0);
    expect(timeSettings.speeds).toContain(1);
    expect(uiTexts.calendar.months).toHaveLength(12);
  });

  it('reports invalid JSON and schema violations', () => {
    expect(validateContentText('a.json', '{', schema)).toHaveLength(1);
    expect(validateContentText('a.json', '{"name": 3}', schema)).toHaveLength(1);
    expect(validateContentText('a.json', '{"name": "x", "extra": 1}', schema)).toHaveLength(1);
    expect(validateContentText('a.json', '{"name": "x"}', schema)).toEqual([]);
  });

  it('reports unregistered and missing files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'content-'));
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'ok.json'), '{"name": "x"}');
    await writeFile(join(dir, 'stray.json'), '{}');
    const { problems } = await validateContentDirectory(dir, {
      'sub/ok.json': schema,
      'missing.json': schema,
    });
    expect(problems.map((p) => p.file)).toEqual(['stray.json', 'missing.json']);
  });
});
