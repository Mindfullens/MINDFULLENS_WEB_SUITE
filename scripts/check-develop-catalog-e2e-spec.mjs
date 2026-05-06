#!/usr/bin/env node
/**
 * Zapobiega uruchamianiu Playwright na przestarzałym specu (np. `toHaveAttribute` na ukrytym filmstripie).
 * Uruchamiane przez npm (`pretest:e2e`) — działa w CI bez aktualizacji workflow YAML.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = path.join(root, 'e2e/develop-catalog-rapid-switch.spec.js');

let src;
try {
  src = fs.readFileSync(f, 'utf8');
} catch {
  console.error(`[check-develop-catalog-e2e-spec] brak pliku: ${f}`);
  process.exit(1);
}

/** W specie Playwright bywa `await expect` + nowa linia + `.poll(` — nie ma dosłownego `expect.poll`. */
const hasPoll = /\.poll\s*\(/.test(src);
if (!src.includes('libraryListboxSel') || !hasPoll) {
  console.error(
    `[check-develop-catalog-e2e-spec] FAIL: ${path.relative(root, f)} — brak oczekiwanego poll na data-asset-count (libraryListboxSel / .poll().\n` +
      '  Zmerguj commit z main (test(e2e): poll data-asset-count …).',
  );
  process.exit(1);
}

if (/expect\s*\(\s*filmstrip\s*\)\s*\.\s*toHaveAttribute/.test(src)) {
  console.error(
    `[check-develop-catalog-e2e-spec] FAIL: usuń expect(filmstrip).toHaveAttribute — psuje się na visibility:hidden w CI.`,
  );
  process.exit(1);
}

process.stdout.write('[check-develop-catalog-e2e-spec] OK\n');
