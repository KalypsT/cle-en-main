import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContentDirectory } from '../validation.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { checked, problems } = await validateContentDirectory(root);

if (problems.length === 0) {
  // Cross-file references are checked when the aggregated content is loaded.
  try {
    await import('../index.ts');
  } catch (error) {
    problems.push({ file: 'références croisées', message: (error as Error).message });
  }
}

for (const problem of problems) console.error(`✗ ${problem.file}\n${problem.message}\n`);
if (problems.length > 0) {
  console.error(`${problems.length} problème(s) dans le contenu.`);
  process.exit(1);
}
console.log(`✓ ${checked.length} fichier(s) de contenu valides : ${checked.join(', ')}`);
