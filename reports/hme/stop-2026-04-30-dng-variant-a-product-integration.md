# STOP — Eksport DNG wariant A (derivative light), integracja produktowa

**Data:** 2026-04-30  
**Zakres:** zamknięcie inicjatywy **MVP DNG wariant A** w sensie kodu + CI + manifest/digest (bez nowego numeru etapu w `STAGES.md`; Etap 16 pozostaje „raster PRO + manifest v1”, patrz `NORTH-STAR.md`).

## Co dostarczono

- **Encoder:** `src/engine/filmLabExportDngVariantA.js` — `encodeFilmLabExportDngDerivativeLightFromCanvas`; MIME `image/x-adobe-dng`; `utif` w `dependencies`.
- **Formaty / modal:** `filmLabExportFormats.js` — `dng` w modalu i opcjonalnych scenariuszach manifestu; i18n PL/EN (`filmLab.exportModal.format.dng`).
- **Silnik:** `useFilmLabEngine.js` — gałąź eksportu DNG (dynamiczny import enkodera, sidecary jak przy PSD).
- **Batch:** `batchProcessor.js` — eksport paczki jako DNG.
- **Manifest / digest:** `filmLabExportManifestReaderExamples.js` — scenariusze single/batch DNG; `scripts/test-export-manifest-digest-reader-example.mjs` — spójność MIME ↔ `.dng`.
- **CI:** `npm run test:film-lab-export-gates` — `film-lab-export-dng-variant-a` + łańcuch export gates.

## Świadomie poza tym STOP (backlog / następne epiki)

- **Compliance (poza kodem):** wewnętrzny **przegląd prawny / sign-off** przed pierwszym **publicznym** releasem buildu z enkoderem DNG (derivative light) — opisany explicite w [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](../../docs/hme/DNG-VARIANT-A-LICENSES-AND-PLAN.md) (*Compliance i release*) oraz SPIKE [**§9**](../../docs/hme/EXPORT-PSD-DNG-SPIKE.md) (*Licencje (formalny sign-off)*); nadal **nieodhaczony** w checklistie.
- **Adobe DNG SDK / Linear DNG** (cel: **pełna zgodność ACR/Lr**): **osobny epik**, poza MVP UTIF — SPIKE **§4.8**, **§11.2**.
- **Worker / XMP / smoke QA:** tabela backlogu — [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](../../docs/hme/DNG-VARIANT-A-LICENSES-AND-PLAN.md) §5; smoke przy RC — przejść [`DNG-EXPORT-SMOKE.md`](../../docs/hme/DNG-EXPORT-SMOKE.md) i uzupełnić **Rejestr wykonania** (ślad dla regresji).

## Odniesienia

- Plan: [`docs/hme/DNG-VARIANT-A-LICENSES-AND-PLAN.md`](../../docs/hme/DNG-VARIANT-A-LICENSES-AND-PLAN.md)  
- SPIKE: [`docs/hme/EXPORT-PSD-DNG-SPIKE.md`](../../docs/hme/EXPORT-PSD-DNG-SPIKE.md) §9–§11
