import { execSync } from 'node:child_process';
import { resolveViteBaseFromProcessEnv } from './lib/gh-pages-base.mjs';

const base = resolveViteBaseFromProcessEnv();
if (!base) {
  process.stderr.write(
    '[build-gh-pages] Ustaw VITE_BASE (np. /MINDFULLENS_WEB_SUITE/) albo GH_PAGES_REPO (np. MINDFULLENS_WEB_SUITE). docs/DEPLOY.md\n',
  );
  process.exit(1);
}

execSync('npm run build', {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: base },
});
