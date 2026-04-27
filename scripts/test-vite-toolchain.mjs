import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wymusza, że zainstalowany Vite ma major ≥ 6 (rejestr na Vite 6+ po migracji z 5).
 * Uruchomienie: z katalogu głównego, po `npm ci` / `npm install`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let raw;
try {
  raw = execFileSync('npm', ['ls', 'vite', '--all', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  if (e.stdout) {
    raw = e.stdout;
  } else {
    process.stderr.write(`[test-vite-toolchain] npm ls vite: ${e?.message ?? e}\n`);
    process.exit(1);
  }
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`[test-vite-toolchain] niepoprawny JSON z npm ls: ${e?.message}\n`);
  process.exit(1);
}

const v = data.dependencies?.vite?.version;
if (!v) {
  process.stderr.write('[test-vite-toolchain] brak dependencies.vite.version w `npm ls vite --json`.\n');
  process.exit(1);
}

const major = parseInt(String(v).split('.')[0], 10);
if (Number.isNaN(major) || major < 6) {
  process.stderr.write(
    `[test-vite-toolchain] Wymagany Vite 6+ (zainstalowano ${v}). Nie cofaj lockfile do Vite 5.\n`,
  );
  process.exit(1);
}

process.stdout.write(`PASS vite-toolchain (vite@${v})\n`);
