# STOP — Phase C „Kino” (CPU): gate weave, double exposure, ramka sprocket

**Data:** 2026-05-05  
**Zakres:** inicjatywa poza numeracją etapów 1–18 (`STAGES.md`), zgodnie z zasadą pracy po zamknięciu programu osiemnastu etapów.

## Cel

Efekty „kinowe” na **jednym torze CPU** co pełny podgląd i eksport (bez osobnego shaderowego/WebGPU MVP): zmniejszenie ryzyka rozjazdu jakości.

## Dostarczone

- **Silnik:** `src/engine/filmLabPhaseCPasses.js` — `applyGateWeaveToImageData`, `applyDoubleExposureBlend`; integracja w `src/engine/useFilmLabEngine.js` (gate weave przed ditherem podglądu; DE po stacku przed compare).
- **Ramka:** `applyFrame` — styl **`sprocket-35`** (proceduralnie).
- **Stan:** `src/filmLab/defaultAdjustments.js` — `gateWeave`, `doubleExposureAmount`, `doubleExposureBlendMode`; API `setDoubleExposureOverlay` / `doubleExposurePlateReady` (`useFilmLabEngine.js`, `useFilmLabEngineSidecar.js`).
- **UI:** zakładka Kino w `src/FilmLabRightPanel.jsx`; shell bundle (`buildFilmLabShellPropBundle.js`, `shellPropBuilders.js`, `buildFilmLabShellContainerBundleArgs.js`).
- **Eksport — komunikaty:** `src/FilmLabExportModal.jsx` — brak drugiej płytki przy siłach DE > 0; **batch** przy DE > 0 — jedna płytka sesji na wszystkie pliki (skalowanie do wyjścia); style `src/filmLabPage.css`.
- **CI:** `npm run test:phase-c-passes` (`scripts/test-film-lab-phase-c-passes.mjs`) w łańcuchu `npm test` / `npm run ci`.
- **i18n:** `src/i18n/locales/en.json`, `pl.json`.

## Persystencja drugiej płytki (OPFS)

- **`src/filmLab/opfs/filmLabOpfsDoubleExposurePlate.js`** — zapis / odczyt / usunięcie bloba (`plate.webp` lub PNG fallback) pod kluczem `getDevelopUploadSourceKey` (jak stabilny identyfikator pliku źródłowego w silniku).
- **`useFilmLabEngine.js`** — po wczytaniu płytki zapis async do OPFS; przy zmianie głównego źródła czyszczona jest bitmapa w RAM i przywracana z OPFS dla nowego klucza (jeśli istnieje); **Clear plate** usuwa też plik w OPFS dla bieżącego źródła.

## Świadome ograniczenia

- Parametry DE (**siła / tryb**) są w **recipe** przez `adjustments`; **plik drugiej płytki** nadal nie jest w recipe JSON — jest cache’owany lokalnie w OPFS per źródło główne.
- Worker proxy / fast WebGPU nie odwzorowują Phase C 1:1 — przy aktywnych efektach obowiązuje deterministyczny tor CPU / idle full zgodnie z istniejącą polityką preview.

## Weryfikacja

- `npm run test:i18n-parity`
- `npm run test:phase-c-passes`
- `npm run build` (w tym `postbuild`: `test:dist-outputs`)
