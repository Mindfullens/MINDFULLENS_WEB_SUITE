# STOP Etap 12 — 2026-04-30 — Range Control MVP

## Etap

- Numer: `12`
- Nazwa: Range Control MVP
- Status: `GO`

## Zakres

### P0 Luma / P1 Color (Hue + chroma przez saturację)

- Wagi **Luma** i **Color** były już w podglądzie CPU i eksporcie maski; **ujednolicono** ścieżkę z pętlą renderu: jeden moduł **`src/engine/filmLabLocalMaskRangeMath.js`** z **`computeLocalMaskWeightAtPixel`** (import w `useFilmLabEngine.js`). Usunięto zduplikowany blok w pętli pikseli — mniejsze ryzyko rozjazdu preview vs eksport.
- Regresja: **`scripts/test-film-lab-range-mask.mjs`**, **`npm run test:range-mask`** (w `test` / `ci`).

### Przygotowanie pod Depth

- **`filmLabMaskGraphIR.js`**: typ węzła **`semantic.depth_range.v1`** na liście znanych typów (walidacja importu).
- **`filmLabRecipeSemanticNodes.js`**: dla `mode === 'depth'` emitowany jest węzeł `semantic.depth_range.v1` ze **`state: 'reserved'`** oraz polami `near` / `far` / `feather` (nullable). Brak mapy głębi w runtime — **bez wpływu na preview**; kontrakt pod przyszły evaluator.

### Świadomie bez zmian w tej iteracji

- **UI trybu Depth** — nie dodawano przycisku (uniknięcie martwego trybu bez silnika); wezel IR jest gotowy na przyszłe podłączenie.
- **WebGPU proxy** — lokalne maski range nadal głównie ścieżka CPU (jak wcześniej).

## Testy

- `npm run test:range-mask`: PASS  
- `npm run test:recipe-import`: PASS  
- `npm run lint`: PASS  
- `npm run test:i18n-parity`: PASS  

## Następny etap

- **`13`** Warstwy v1 (non-destructive core) lub utwardzenie depth (mapa + evaluator).
