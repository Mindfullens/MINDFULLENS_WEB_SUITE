#!/usr/bin/env node
/**
 * Named import z `react-window` potrafi się rozwiązać na `dist/react-window.js` i wywalić Rollupa.
 * react-window v2 eksportuje `Grid`/`List`, nie `FixedSizeList` — trzymamy namespace import.
 * Ten skrypt musi przejść przed `vite build` / `npm run ci`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/filmLab/FilmLabFilmstripCanvas.jsx');

let src;
try {
  src = fs.readFileSync(file, 'utf8');
} catch {
  console.error(`[check-filmstrip-react-window-import] brak pliku: ${file}`);
  process.exit(1);
}

/** Komentarze w pliku cytują stary import — skanujemy kod po wycięciu bloku `/* … */` i `//`. */
const stripped = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const hasBadNamedImport =
  /import\s*\{[^}]*FixedSizeList[^}]*\}\s*from\s*['"]react-window['"]/.test(stripped);
const hasNamespaceImport =
  /import\s*\*\s*as\s+ReactWindow\s+from\s*['"]react-window['"]/.test(stripped);
const hasGridBinding = /const\s+Grid\s*=\s*ReactWindow\.Grid\b/.test(stripped);

if (hasBadNamedImport || !hasNamespaceImport || !hasGridBinding) {
  console.error(
    `[check-filmstrip-react-window-import] FAIL: ${path.relative(root, file)}\n` +
      '  Wymagane: import * as ReactWindow from \'react-window\' oraz const Grid = ReactWindow.Grid.\n' +
      '  Named import FixedSizeList psuje build (Rollup + react-window); v2 używa Grid/List.\n',
  );
  console.error('--- pierwsze 15 linii ---\n' + src.split(/\r?\n/).slice(0, 15).join('\n') + '\n---');
  process.exit(1);
}

process.stdout.write('[check-filmstrip-react-window-import] OK\n');
