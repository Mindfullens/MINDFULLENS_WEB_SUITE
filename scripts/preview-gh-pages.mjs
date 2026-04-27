import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filmLabOpenPathForBase,
  resolveViteBaseFromProcessEnv,
} from './lib/gh-pages-base.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = path.join(root, 'dist', 'index.html');

if (!existsSync(distIndex)) {
  process.stderr.write(
    '[preview-gh-pages] Brak dist/. Najpierw: npm run build:gh-pages (albo VITE_BASE=... npm run build). docs/DEPLOY.md\n',
  );
  process.exit(1);
}

const base = resolveViteBaseFromProcessEnv();
if (!base) {
  process.stderr.write(
    '[preview-gh-pages] Ustaw tę samą zmienną co przy buildzie: VITE_BASE albo GH_PAGES_REPO. docs/DEPLOY.md\n',
  );
  process.exit(1);
}

const mlOpen = filmLabOpenPathForBase(base);

execSync('npm run preview', {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: base, ML_DEV_OPEN: mlOpen },
});
