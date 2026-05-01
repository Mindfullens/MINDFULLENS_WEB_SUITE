# STOP Etap 6 — 2026-04-30 — Biblioteka (DAM) v1

## Etap

- Numer: `6`
- Nazwa: Biblioteka (DAM) v1
- Status: `GO`

## Zakres wdrożony (pliki/moduły)

- `src/filmLab/catalogPro/filmLabCatalogSemanticImport.js` — **SemanticIndex przy imporcie** (tagi: rozszerzenie, `kind:raw`, skrót aparatu, słowa z nazwy pliku); **bez generowania masek**
- `src/filmLab/catalogPro/filmLabCatalogPipelineMerge.js` — scalanie dokumentu katalogu z **stanem potoku** (`hasDecodedFrame`, snapshot EXIF, semantic index)
- `src/filmLab/useFilmLabCatalogProLibraryWorkspace.js` — po wczytaniu z IndexedDB **wzbogacanie** przy zmianie metadanych obrazu / EXIF (`pipelineEnrichmentKey`), zapis z powrotem do IDB
- `src/filmLab/useFilmLabFilmLabPro.js` — przekazanie `exifMeta` / `imageMeta` do hooka biblioteki
- `src/FilmLabLibraryWorkspace.jsx` — panel metadanych: **snapshot EXIF** (`mindfullens.catalog-exif-snapshot.v1`) jako czytelna lista pól; legacy — JSON
- `src/i18n/locales/pl.json`, `en.json` — etykiety pól snapshotu
- `scripts/test-film-lab-catalog-dam-v1.mjs` — regresja helperów + merge
- `package.json` — `npm run test:catalog-dam` w `test` i `ci`

## Testy i wynik

- `npm run test:catalog-dam`: PASS
- `npm run lint`: PASS
- `npm run test:i18n-parity`: PASS

## Wpływ UX/produkt (co użytkownik już widzi)

- Zakładka **Biblioteka**: po wczytaniu zdjęcia siatka pokazuje tagi semantic (m.in. `ext:`, `kind:raw`, `camera:…`, `kw:…`); panel boczny pokazuje **uproszczone EXIF** (aparat, ISO, wymiary, itd.) zamiast surowego JSON, gdy snapshot jest dostępny.

## Ryzyka i decyzje architektoniczne

- Jeden zasób referencyjny **`asset_1`** na bieżącą sesję pliku — zgodnie z istniejącym modelem katalogu v0; pełny multi-import DAM = kolejny epik.
- Podwójny zapis do IDB możliwy przy pierwszym wejściu (fallback + merge) — akceptowalny koszt.

## Następny etap (1 krok dalej)

- Następny etap: `7` — Develop v2 (globalna edycja RAW)
- Zakres startowy: dopracowanie layoutu Develop vs shell 3-panelowy

---
