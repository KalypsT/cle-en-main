import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContentDirectory } from '../validation.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { checked, problems } = await validateContentDirectory(root);

for (const problem of problems) console.error(`✗ ${problem.file}\n${problem.message}\n`);
if (problems.length > 0) {
  console.error(`${problems.length} problème(s) dans le contenu.`);
  process.exit(1);
}
console.log(`✓ ${checked.length} fichier(s) de contenu valides : ${checked.join(', ')}`);
