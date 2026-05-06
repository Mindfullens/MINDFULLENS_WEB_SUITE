# STOP — Etap 18: Performance hardening + release gates

**Data:** 2026-04-30  
**Zakres:** Utrwalenie **GO/NO-GO** dla wydajności: jawne cele KPI w repozytorium, rozszerzenie statycznego gate’a CI o elementy batch-perf, OOM (budżet pikseli), kafelkowanie i worker — bez forkowania silnika.

## Dostarczone

- `src/filmLab/filmLabPerfKpiTargets.js` — stałe referencyjne (ms suwaka, ms AI mask, % crash-free, MP referencyjne), zgodne z `docs/hme/NORTH-STAR.md`.
- `scripts/film-lab-export-perf-gates.mjs` — import asercji wartości KPI; dodatkowe match’e na:
  - `batchPerf.js` (`mindfullens.batch-perf.v1`, `measureAsync`, `IS_BATCH_PERF_ENABLED`),
  - `batchProcessor.js` (perf + komentarz agresywnego zwalniania między plikami),
  - `proxySourceDownscale.js` (`MAX_DOWNSCALE_OUTPUT_PIXELS`, `isDownscaleOutputWithinPixelBudget`),
  - `proxyImageTilePlan.js` (`planImageTileGrid`),
  - `proxyRenderWorker.js` (kafelki / `tile_rgba8` / `tilesNeededAtEdge`).

## Weryfikacja

- `npm run test:film-lab-export-gates` (łańcuch obejmuje `film-lab-export-perf-gates.mjs`)
- `npm run lint`

## Uwagi

- KPI są **udokumentowane w kodzie** i chronione przed cichą zmianą numerów przez gate; pełna telemetryczna egzekucja progów w runtime pozostaje poza tym etapem (product/infra).
