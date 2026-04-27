# Sprint 1 Execution Plan (20.04.2026 - 01.05.2026)

Zobacz też:

- [`MINDFULLENS_FILM_LAB_PLAN_V3_1.md`](MINDFULLENS_FILM_LAB_PLAN_V3_1.md) (spójny plan strategiczny po tej stabilizacji)
- [`PLAN_SPRINTOWY_90_DNI.md`](PLAN_SPRINTOWY_90_DNI.md) (horyzont 90 dni, statusy sprintów)
- [`README.md`](README.md) (mapa dokumentacji w `docs/`)

**Po zamknięciu S1 (2026-04+):** na bazie tej samej warstwy DIAG / Render Debug doszła obserwowalność **A/B głównego podglądu WebGPU** (badge, progi rollout health/gate, E2E w UI, eksport pól w JSON). **Powtarzalny protokół baseline** (sesja w przeglądarce, minimalny zestaw pól DIAG, szablon tabeli wyników) jest w [`MINDFULLENS_FILM_LAB_PLAN_V3_1.md`](MINDFULLENS_FILM_LAB_PLAN_V3_1.md) **§9.12**; skróty npm: `dev:webgpu:main-ab`, `build:preview:webgpu:main-ab` (por. `package.json`).

## Cel sprintu
Stabilizacja silnika podglądu Film-Lab, pełna powtarzalność skrótów, oraz diagnostyka regresji renderu.

## Scope (P0/P1)

### P0
- Geometria preview/zoom/pan bez regresji.
- Testy regresji renderu na zestawie referencyjnym.
- Telemetria CPU/GPU/fallback (czas i ścieżka renderu).
- Crash guard + czytelne raportowanie błędów pipeline.

### P1
- Debug overlay developerski.
- Spójny system skrótów: `F`, `\\`, `J`, `0`, `+`, `-`.

## Breakdown prac

### 1) Preview geometry hardening
- [x] Zoom anchored do kursora (wheel + skróty).
- [x] Pan klawiaturą i myszą po przekroczeniu 100%.
- [x] Snapshot testy geometrii dla 4 scenariuszy:
  - poziome zdjęcie @ 100%
  - pionowe zdjęcie @ 100%
  - poziome @ 280% + pan
  - pionowe @ 280% + pan

### 2) Shortcut reliability
- [x] Centralizacja mapy skrótów w `FilmLab.jsx` (`SHORTCUT_KEYS`).
- [x] Tooltips powiązane z mapą skrótów (brak ręcznych rozjazdów).
- [x] Guard regresji w `scripts/regression-film-lab.mjs` dla `F`, `\\`, `J`, `0`, `+`, `-`.

### 3) Render diagnostics
- [x] Render debug panel (CPU/GPU/worker path + ms).
- [x] Eksport prostego raportu diagnostycznego do JSON (debug mode).
- [x] Alert z kodem błędu dla nieudanego renderu worker/GPU.

### 4) Testowanie i bramka jakości
- [x] `npm run test:regression` jako szybki gate.
- [x] Dodanie scenariusza E2E: przełączanie `przed/po`, clipping i full preview.
- [x] Krótka checklista release dla debug build.

### 5) Debug Build Release Checklist
- [x] `npm run test:regression` = PASS.
- [x] `npm run build` = PASS.
- [x] W podglądzie działa: `\` (przed/po), `J` (clipping), `F` + `Esc` (full/exit full).
- [x] `DIAG JSON` zapisuje plik raportu i zawiera: `flags`, `render.fallback`, `render.alert`.
- [x] Batch export (`Paczka zdjęć`) działa dla miksu JPG + RAW (CR2/ARW/DNG) bez podwójnego pickera.
- [x] `Kopiuj/Wklej` przenosi pełny stan (w tym profil) przez przycisk i `Cmd/Ctrl+C`, `Cmd/Ctrl+V`.
- [x] Metadane startują domyślnie jako wyłączone; `I` przełącza panel, `M` przełącza tryb.

## Definition of Done (Sprint 1)
- Skróty działają stabilnie i nie znikają po refaktorach.
- Zoom/pan nie łamie układu w typowych orientacjach zdjęć.
- Diagnostyka jasno pokazuje, czy render idzie CPU czy GPU.
- Regresje są wyłapywane automatycznie przed buildem.

## Ryzyka
- Rozjazd między worker path i CPU path przy aktywnych suwakach.
- Różne zachowanie Fullscreen API między przeglądarkami.
- Brak pełnej konfiguracji ESLint v9 (obecnie gate lint nie jest wiarygodny).
