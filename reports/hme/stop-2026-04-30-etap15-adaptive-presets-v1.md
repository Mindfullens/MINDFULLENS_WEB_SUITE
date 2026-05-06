# STOP — Etap 15: AI/Automatyzacja + Adaptive Presets v1

**Data:** 2026-04-30  
**Zakres:** Preset-instrukcja JSON (`mindfullens.adaptive-preset.v1`), bezpieczny patch pól Develop, kroki `setPatch` / `recomputeAiMasks`, zakładka **AI/Automatyzacja** w shellu, wsad z opcją przeliczenia masek AI-assist (heurystyka) per plik poprzez nadpisanie `adjustments` tylko na czas `renderToContext`.

## Dostarczone

- `src/filmLab/adaptivePresetV1.js` — parser, `applyAdaptivePresetPatch`, `recomputeAiAssistMasksHeuristic`, `applyAdaptivePresetV1Steps`, eksport `analyzeLocalMaskAiAssistPresetSync`.
- `src/FilmLabAiAutomationWorkspace.jsx` — edycja JSON, przykład, import/pobieranie, `localStorage` `filmLab.adaptivePreset.v1`, przycisk przeliczenia masek, wsad (ten sam `batchFileInputRef` co toolbar) + modal eksportu, checkbox `batchRecomputeAiMasksHeuristic`.
- `defaultAdjustments.js` — `batchRecomputeAiMasksHeuristic: false`.
- `useFilmLabEngine` — `batchAdjustmentsOverrideRef` + `adjustmentsForRender` w całym `renderToContext`; `processBatch` → `prepareAdjustmentsForBatchFile` + `batchAdjustmentsOverrideRef` gdy checkbox włączony.
- `batchProcessor.js` — obsługa `prepareAdjustmentsForBatchFile` i `batchAdjustmentsOverrideRef` (reset w `finally`).
- i18n: `filmLab.aiAutomation.*` (PL/EN).
- Test: `npm run test:adaptive-preset-v1`.

## Weryfikacja

- `npm run test:adaptive-preset-v1`
- `npm run test:i18n-parity`

## Uwagi

- Maska / przepis w ZIP-ie sidecaru pozostają oparte o bieżący stan sesji; per-plik dotyczy **renderu** z przeliczonymi maskami (MVP zgodnie z E15).
