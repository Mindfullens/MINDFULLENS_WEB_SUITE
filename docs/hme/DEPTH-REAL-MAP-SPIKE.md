# Rzeczywista mapa głębi — SPIKE roboczy

**Status:** integracja ONNX + recipe (**2026-05**) — [`stop-2026-05-02-depth-onnx-integration`](../../reports/hme/stop-2026-05-02-depth-onnx-integration.md); poniżej nadal aktualny opis SPIKE i backlog.

## Cel

Zastąpić lub uzupełnić proxy luminancją mapą głębi z inferencji (ONNX) lub metadanych (dual-pixel / stereo — poza MVP), z **non-destructive** zapisem w recipe.

## Kierunki

1. **Źródło**: jednoplane RGB → model depth (lokalny ONNX, lazy load, cache jak AI mask); alternatywnie kanał z metadanych jeśli dostępny.
2. **Kontrakt**: rozszerzenie `semantic.depth_range.v1` (np. `proxySource: 'onnx' | 'luminance'`) lub osobny węzeł referencyjny do bufora depth — decyzja przy pierwszej integracji.
3. **Silnik**: `filmLabLocalMaskRangeMath.js` — gałąź `depth`; **`resolveDepthProxy01()`** używa opcjonalnego `maskEntry.depthProxyBuffer` (Float32 per piksel); bez bufora — `rgbRec709LumaUnit()`. Przy **`depthMapSource === 'luminance'`** podgląd CPU materializuje scratch (`depthLumaMaterializeRef`) w pętli renderu (te same RGB co maska), potem zeruje wskaźnik przed retuszem Heal; eksport maski PNG wypełnia bufor z `transformedSource`.

4. **Recipe**: `semantic.depth_range.v1` ma **`mapSource`** (np. `luminance`, później identyfikator modelu); **`proxySource`** — pole zgodności wstecznej / krótka etykieta (`luminance` albo to samo co mapSource).

5. **Runtime ONNX (roboczo):** UI przełącza `depthMapSource` (`luminance` | `onnx`). Bez `VITE_FILMLAB_DEPTH_ONNX_MODEL_URL` inferencja zwraca `null` → podgląd używa luminancji w pętli (fallback). Test toru: `VITE_FILMLAB_DEPTH_ONNX_USE_LUMA_FALLBACK=1` materializuje luminancję przez `inferDepthProxyBufferFromImageData` + digest (`filmLabDepthOnnxInference.js`).

### Recipe ↔ ONNX (zapis)

- **Workbench:** `adjustments.depthMapSource` (`luminance` | `onnx`).
- **Projekcja grafu:** `filmLabRecipeMaskProjection.js` → `depth.mapSource` na slocie → węzeł `semantic.depth_range.v1` ma **`mapSource`** i **`proxySource`** (dla `luminance` oba `luminance`; dla ONNX oba `onnx`).
- **Import / eksport:** ten sam dokument recipe co dla innych masek — round-trip JSON utrzymuje `depthMapSource` w `global.adjustments` oraz semantykę w `maskGraphs` (skrypt: `scripts/test-recipe-import.mjs`).

### ONNX — wejście/wyjście (implementacja)

- Moduł: `src/filmLab/depth/filmLabDepthOnnxInference.js` — lazy `onnxruntime-web`, bufor Float32 + digest.
- **Wejście RGB:** NCHW lub NHWC (auto po metadanych); **wymuszenie:** `VITE_FILMLAB_DEPTH_ONNX_INPUT_LAYOUT=nchw|nhwc`.
- **Pozostałe env:** `VITE_FILMLAB_DEPTH_ONNX_MODEL_URL`, `VITE_FILMLAB_DEPTH_ONNX_MAX_SIDE`, `VITE_FILMLAB_DEPTH_ONNX_IMAGENET_NORM`, `VITE_FILMLAB_DEPTH_ONNX_USE_LUMA_FALLBACK` — szablony w `.env.example`.
- Po wdrożeniu idle i kontraktu wyjścia (2026-05): do powyższego dochodzą `OUTPUT_NAME` / `OUTPUT_INDEX`, `DEPTH_CHANNELS` oraz `IDLE_TIMEOUT_MS` — procedura i troubleshooting w [`DEPTH-ONNX-SMOKE`](DEPTH-ONNX-SMOKE.md), podsumowanie w [`stop-2026-05-02-depth-onnx-integration`](../../reports/hme/stop-2026-05-02-depth-onnx-integration.md) (§ Aktualizacja).

### Checklista QA (przeglądarka, build z modelem)

Procedura smoke: [`DEPTH-ONNX-SMOKE.md`](DEPTH-ONNX-SMOKE.md) · STOP §2: [`../reports/hme/stop-2026-05-02-depth-onnx-integration.md`](../reports/hme/stop-2026-05-02-depth-onnx-integration.md).

### Import receptury (wklejenie JSON)

`applyRecipeDocument` odtwarza `global.adjustments` z koperty v1 (`useFilmLabRecipeDocumentApply`). Ścieżka ta sama co `applyRecipeTextToWorkbench` w panelu debug — regresja skryptowa: `applyRecipeTextToWorkbench` + `depthMapSource: 'onnx'` w `scripts/test-recipe-import.mjs`.

### Rozszerzenia modelu (kolejne iteracje)

- **Wiele wejść** lub **batch** — osobna specyfikacja tensorów; punkt zaczepienia: `inferDepthProxyBufferFromImageData` + metadane sesji.
- **Wyjście wielokanałowe** — `VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS` + heurystyka kształtu w `extractDepthPlaneFromOnnxTensor` (per model nadal: dobór `OUTPUT_*`).
- Metadane dual-pixel / stereo — poza zakresem obecnego modułu.

## PASS pierwszego merga (propozycja)

- Przewidywalny bufor depth (Float32, rozdzielczość proxy) + ten sam UX zakresu co dziś.
- Recipe round-trip + test skryptowy jak przy zakresach maski.
