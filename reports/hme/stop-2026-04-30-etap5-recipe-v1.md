# STOP Etap 5 — 2026-04-30 — Kontrakt Recipe v1 (spójność warstwy ↔ graf)

## Etap

- Numer: `5`
- Nazwa: Kontrakt Recipe v1 (nieniszczący zapis)
- Status: `GO`

## Zakres wdrożony (pliki/moduły)

- `src/filmLab/recipe/filmLabRecipeValidate.js` — walidacja miękka rozszerzona o:
  - **duplikaty `id` węzłów** we wszystkich grafach IR (`maskGraph_duplicate_node_id_*`),
  - **rozwiązanie referencji warstwy** (`layer.maskGraphNodeId` przy `layerStackBindingVersion === 1`) względem zbioru id węzłów z `maskGraphs` (`layer_maskGraphNodeId_unresolved_*`).
- `scripts/test-recipe-envelope.mjs` — regresja: spójny stack warstw + maski, niespójna referencja, duplikat id.

Istniejący łańcuch **Recipe → maskGraphs / layers → render / eksport** (`encodeFlatSnapshotToRecipeDocument`, `fingerprintRecipeDocumentStable`, `parseRecipeDocumentJson`, worker payload) pozostaje źródłem prawdy; ta zmiana domyka **kontrakt referencyjny** warstwa → węzeł grafu przy imporcie i narzędziach CLI.

## Testy i wynik

- `node scripts/test-recipe-envelope.mjs`: PASS
- `node scripts/test-recipe-import.mjs`: PASS
- `npm run lint`: PASS

## Wpływ UX/produkt (co użytkownik już widzi)

- Import recipe JSON z **rozjechanym** `maskGraphNodeId` dostaje ostrzeżenia (`parseRecipeDocumentJson.warnings`); `validEnvelope` jest false przy dowolnym ostrzeżeniu walidacji.

## Ryzyka i decyzje architektoniczne

- Nadal **miękka** walidacja (bez throw) — kompatybilność z częściowymi dokumentami i przyszłymi polami.
- Grafy nienormatywne IR nie wnoszą id do zbioru — warstwy mogą raportować `unresolved` obok `maskGraph_ir_mismatch_*` (zamierzone).

## Następny etap (1 krok dalej)

- Następny etap: `6` — Biblioteka (DAM) v1
- Zakres startowy: katalog zasobów + EXIF panel vs recipe sidecar (opcjonalne powiązanie)

---
