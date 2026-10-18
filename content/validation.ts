import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { contentRegistry } from './registry.ts';

export interface ContentProblem {
  file: string;
  message: string;
}

const IGNORED = new Set(['node_modules', 'package.json', 'tsconfig.json']);

async function listJsonFiles(root: string, dir = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(root, path)));
    else if (entry.name.endsWith('.json')) files.push(relative(root, path).split(sep).join('/'));
  }
  return files.sort();
}

/** Checks one file's raw text against a schema. */
export function validateContentText(
  file: string,
  text: string,
  schema: z.ZodType,
): ContentProblem[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return [{ file, message: `JSON invalide : ${(error as Error).message}` }];
  }
  const result = schema.safeParse(data);
  return result.success ? [] : [{ file, message: z.prettifyError(result.error) }];
}

/** Validates every JSON file under `root`; unregistered or missing files are problems too. */
export async function validateContentDirectory(
  root: string,
  registry: Readonly<Record<string, z.ZodType>> = contentRegistry,
): Promise<{ checked: string[]; problems: ContentProblem[] }> {
  const files = await listJsonFiles(root);
  const problems: ContentProblem[] = [];
  for (const file of files) {
    const schema = registry[file];
    if (!schema) {
      problems.push({ file, message: 'Aucun schéma déclaré dans content/registry.ts.' });
      continue;
    }
    problems.push(...validateContentText(file, await readFile(join(root, file), 'utf8'), schema));
  }
  for (const file of Object.keys(registry)) {
    if (!files.includes(file)) problems.push({ file, message: 'Fichier déclaré mais absent.' });
  }
  return { checked: files, problems };
}
