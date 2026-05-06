import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Kopiuje pliki RAW z katalogu DAM do ścieżek `assetRelativePath` z REFERENCE-SET-MANIFEST.json.
 *
 * Użycie:
 *   MINDFULLENS_RAW_ROOT="/ścieżka/do/RAW" node scripts/sync-reference-set-assets.mjs
 *   node scripts/sync-reference-set-assets.mjs --from "/ścieżka/do/RAW"
 *   node scripts/sync-reference-set-assets.mjs --from "..." --dry-run
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(
  root,
  'data',
  'reference-sets',
  'reference-set-v1',
  'REFERENCE-SET-MANIFEST.json',
);

function parseArgs(argv) {
  let fromDir = process.env.MINDFULLENS_RAW_ROOT?.trim() || '';
  let dryRun = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--from' && argv[i + 1]) {
      fromDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (a.startsWith('--from=')) {
      fromDir = a.slice('--from='.length);
    }
  }
  return { fromDir, dryRun };
}

const { fromDir, dryRun } = parseArgs(process.argv);

if (!fromDir) {
  process.stderr.write(
    `Brak katalogu źródłowego. Ustaw MINDFULLENS_RAW_ROOT lub:\n  node scripts/sync-reference-set-assets.mjs --from "/ścieżka/do/RAW"\n`,
  );
  process.exit(1);
}

const resolvedFrom = path.resolve(fromDir);
if (!fs.existsSync(resolvedFrom) || !fs.statSync(resolvedFrom).isDirectory()) {
  process.stderr.write(`Nie ma katalogu: ${resolvedFrom}\n`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'mindfullens.reference-set.v1' || !Array.isArray(manifest.items)) {
  process.stderr.write('Niepoprawny manifest reference-set.\n');
  process.exit(1);
}

const missingSrc = [];
let copied = 0;
for (const item of manifest.items) {
  const rel = item.assetRelativePath;
  if (typeof rel !== 'string' || !rel) {
    process.stderr.write(`${item.id}: brak assetRelativePath\n`);
    process.exit(1);
  }
  const base = path.basename(rel);
  const src = path.join(resolvedFrom, base);
  const dest = path.join(root, rel);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    missingSrc.push({ id: item.id, base, src });
    continue;
  }
  if (dryRun) {
    process.stdout.write(`[dry-run] ${base} -> ${rel}\n`);
    copied += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  process.stdout.write(`OK ${item.id} ${base}\n`);
  copied += 1;
}

if (missingSrc.length > 0) {
  for (const m of missingSrc) {
    process.stderr.write(`BRAK źródła [${m.id}]: ${m.src}\n`);
  }
  process.stderr.write(
    `\nUzupełnij pliki w ${resolvedFrom} (nazwa musi zgadzać się z basename assetRelativePath).\n`,
  );
  process.exit(1);
}

const suffix = dryRun ? ' (dry-run)' : '';
process.stdout.write(
  `\nPASS sync-reference-set-assets: ${copied}/${manifest.items.length} pozycji${suffix}\n`,
);
