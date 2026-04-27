import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['dist', '.eslintcache', '.vite', 'coverage', '.turbo', '.cache'];

for (const name of targets) {
  const target = path.join(root, name);
  try {
    await fs.rm(target, { recursive: true, force: true });
    process.stdout.write(`[clean] removed ${name}\n`);
  } catch (error) {
    process.stderr.write(`[clean] skip ${name}: ${error?.message ?? error}\n`);
  }
}
