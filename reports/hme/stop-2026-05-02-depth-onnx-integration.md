# STOP — integracja mapy głębi ONNX (P2, po proxy luminancji)

**Data:** 2026-05-02  
**Zakres:** domknięcie ścieżki **depth map source = ONNX** w silniku, recipe, testach i dokumentacji roboczej; checklista QA; kierunki na kolejne modele.

## 1. Raport programu (kryteria „1”)

- **Silnik / inferencja:** `src/filmLab/depth/filmLabDepthOnnxInference.js` — lazy `onnxruntime-web`, wspólny fetch/sesja z `filmLabOnnxRuntimeAdapter.js`, wejście NCHW i NHWC, wybór tensora wyjścia (`pickDepthOnnxOutputTensor`: env `VITE_FILMLAB_DEPTH_ONNX_OUTPUT_NAME` / `OUTPUT_INDEX`), agregacja wielu kanałów wyjścia (`VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS` = `first` \| `mean`), normalizacja min–max, digest (`filmLabDepthProxyDigest.js`); `useFilmLabEngine.js` — debounce (200 ms) + start inferencji przez `scheduleDepthOnnxInferOnIdle` (`filmLabDepthOnnxHostSchedule.js`, opcjonalnie `VITE_FILMLAB_DEPTH_ONNX_IDLE_TIMEOUT_MS`), anulowanie poprzedniego idle przy nowym podglądzie, licznik sekwencji odrzucający stare promise’y; `depthOnnxExternalRef` / snapshot maski.
- **UI + i18n:** `FilmLabLocalMaskWorkbench.jsx` — wiersz źródła mapy; `depthMapSourceOnnxHelp` (PL/EN) z env i layout.
- **Recipe:** `depthMapSource` → `semantic.depth_range.v1` (`mapSource` / `proxySource`); round-trip w `scripts/test-recipe-import.mjs` (w tym `onnx` i symulacja `applyRecipeTextToWorkbench`).
- **Testy CI:** `test:depth-proxy-digest`, `test:depth-onnx-inference` w łańcuchu `npm test` / `ci`.
- **Dokumentacja:** `docs/hme/DEPTH-REAL-MAP-SPIKE.md` (Recipe, env, E2E, rozszerzenia — patrz ten sam plik po tej dacie).

## 2. Checklista QA w przeglądarce (E2E ręczne)

Szczegółowa procedura (kroki, troubleshooting): [`docs/hme/DEPTH-ONNX-SMOKE.md`](../../docs/hme/DEPTH-ONNX-SMOKE.md).

Skrót: `.env` z `VITE_FILMLAB_DEPTH_ONNX_MODEL_URL` → `npm run dev` → Głębia → ONNX; obserwacja linii statusu pod przełącznikiem (ładowanie / ostrzeżenie fallbacku); regulacja `INPUT_LAYOUT` / `MAX_SIDE` / `IMAGENET_NORM` przy złej mapie; przy **wielu wyjściach** — `OUTPUT_NAME` lub `OUTPUT_INDEX`; przy **wielu kanałach** na wyjściu — `DEPTH_CHANNELS`; opcjonalnie timeout idle — `IDLE_TIMEOUT_MS` (szczegóły w smoke).

## 3. Regresja „wklej recepturę” (produkt)

- Handler `applyRecipeDocument` (`useFilmLabRecipeDocumentApply`) odtwarza `global.adjustments` z JSON; **test skryptowy** w `test-recipe-import.mjs` odzwierciedla ścieżkę `applyRecipeTextToWorkbench` + `depthMapSource: 'onnx'`.
- Pełne UI: wklejenie JSON receptury (panel debug / skrót) z tym samym kształtem koperty v1 — smoke ręczny opcjonalny, logika taka sama co test.

## 4. Następne kontrakty modeli (kolejna iteracja inżynierska)

- **Wiele wejść** (np. RGB + poprzednia mapa): rozszerzyć `inferDepthProxyBufferFromImageData` o listę kanałów / drugi tensor — contract per model, nie w tym STOP.
- **N batch / rozmiar stały** tylko w metadanych: ewent. dopasowanie letterbox (już częściowo w `resolveDepthRgbInputDims`).
- **Wyjście wielokanałowe** (np. [1,3,H,W]): sterowane env **`VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS`** (`first` — domyślnie, `mean` — średnia po kanałach w układzie NCHW/NHWC); heurystyka kształtu w `extractDepthPlaneFromOnnxTensor`.
- **Offload WASM z wątku głównego:** worker + bundle `onnxruntime-web` / transfer buforów — osobna iteracja (idle jest kompromisem między responsywnością UI a czasem pierwszego `run`).

### Aktualizacja (idle + kontrakt wyjścia / kanały)

**Data:** 2026-05-03 — dopisane do powyższego zakresu: `filmLabDepthOnnxHostSchedule.js`, env wyjścia i kanałów (patrz `.env.example`, `vite-env.d.ts`), testy w `scripts/test-film-lab-depth-onnx-inference.mjs` (`pickDepthOnnxOutputTensor`, agregacja `mean`). Powód nowego kodu błędu: brak dopasowanego tensora wyjścia → `output_missing`.

## Linki

- SPIKE: [`docs/hme/DEPTH-REAL-MAP-SPIKE.md`](../../docs/hme/DEPTH-REAL-MAP-SPIKE.md)  
- Poprzedni depth proxy: [`stop-2026-04-30-depth-proxy-preview.md`](./stop-2026-04-30-depth-proxy-preview.md)
