# ADR-001: Recipe envelope (format v1)

## Context

Film Lab persists “edits” as JSON alongside raw bytes (IndexedDB autosave). Historically the whole persisted object was a flat snapshot (`adjustments`, curves, zoom, …). The product roadmap requires a **single non-destructive recipe**: global develop, mask graphs (not bitmaps as source of truth), layers, and optional AI index.

## Decision

- Introduce a **versioned recipe document** with `formatVersion: 1` and `engine: mindfullens-film-lab`.
- **Global develop state** lives under `global` — same fields as today’s snapshot, so the React workbench can restore without a big-bang refactor.
- **Mask graphs, layers, AI index** are first-class arrays/objects in the document; they start empty until those engines exist.
- **Legacy sessions** (flat snapshot only) remain readable: decoder treats missing `formatVersion` as legacy and passes the object through as the flat snapshot.
- **Render debug export** includes the same v1 document as `filmLabRecipeDocument` (full state for support / diffing).
- **Edit clipboard (v3)** stores a parallel `filmLabRecipeDocument` for forward compatibility; paste prefers decoded `global` when present.
- **Stub mask graph** type lives in `src/filmLab/recipe/filmLabRecipeStubMask.js` for the HME node graph (empty `nodes` until the mask engine ships).
- **`maskGraphs` projection** (`filmLabRecipeMaskProjection.js`): przy zapisie recipe dokumentuje stack masek + combine + „live slot” jako węzły (`mindfullens.mask-graph.adjustments-projection-v1`). Silnik nadal renderuje z `adjustments`; to jest kanoniczny zapis produktowy i baza pod prawdziwy evaluator grafu.
- **`layers` w kopercie**: kopia `recipeLayersV0` z order — źródło stanu nadal w `global.adjustments`.

### Pakiet rozszerzeń (sesja 2+)

- `aiIndex` — `buildAiIndexFromAdjustments` (schema `mindfullens.ai-index.snapshot-v1`): backend, `aiAssistRuns`, heurystyka slotów `ai-assist`.
- `meta` — stempel enkodera + `encodedAtMs` (pomijany w stabilnym fingerprint).
- `recipeStats` — liczniki masek / warstw / stroke + flaga combine (invalidacja, batch).
- `history` — pusta tablica, rezerwa na wskaźniki historii na poziomie recipe.
- `filmLabMaskGraphEvaluate.js` — kontrakt stub ewaluatora grafu (`stub-v0`).
- `filmLabRecipeMerge.js` — `mergeRecipeGlobalAdjustmentsPatch` dla presetów batched.
- `filmLabRecipeFingerprint.js` — stabilny fingerprint po usunięciu pól volatile (`encodedAtMs`, `generatedAt`).
- **Semantyczne węzły** (`filmLabRecipeSemanticNodes.js`) — obok `mask.slot.v1` dopisywane są `semantic.brush_strokes.v1`, `semantic.linear_gradient.v1`, `semantic.radial_gradient.v1`, `semantic.luma_range.v1`, `semantic.hue_range.v1` wg `mode`.
- **Sidecar JSON** (`filmLabRecipeSidecar.js`) — `recipeDocumentToJsonString`, `downloadRecipeDocumentInBrowser`.
- **Walidacja / batch** — `softValidateRecipeDocument`, `applySequentialAdjustmentPatches`.
- **`useFilmLabRecipeFingerprintEcho`** — `window.__mindfullensRecipeFingerprint` (diagnostyka; cache podglądu nadal przez silnik).
- **Render Debug** — drugi przycisk **Recipe** (`.recipe.json`); raport JSON zawiera `recipeFingerprintStable`.
- **Import / normalizacja** — `parseRecipeDocumentJson`, `normalizeToRecipeDocumentV1` (`filmLabRecipeImport.js`, `filmLabRecipeNormalize.js`).
- **Worker payload** — `buildMaskEngineWorkerPayload` (kompakt + fingerprint, `mindfullens.mask-engine.worker-payload.v0`).
- **Stałe** — `filmLabRecipeConstants.js` (re-eksport schematów).
- **Testy** — `scripts/test-recipe-import.mjs` w łańcuchu `npm test` / `ci`.

## Consequences

- Session save writes the v1 envelope; restore unwraps `global` for existing `restoreSnapshot` code.
- Future: mask engine fills `maskGraphs`, layer stack fills `layers`; render pipeline reads the document and invalidates caches by changed subtrees.
- Clipboard / export JSON can adopt the same envelope later with a separate version line if needed.

Implementation: `src/filmLab/recipe/filmLabRecipeCodec.js`.
