# STOP Etap 10 — 2026-04-30 — AI Mask MVP

## Etap

- Numer: `10`
- Nazwa: AI Mask MVP
- Status: `GO`

## Zakres wdrożony

- **`src/filmLab/onnx/filmLabOnnxRuntimeAdapter.js`**
  - Lazy import `onnxruntime-web` (bez zmian kontraktu).
  - **`getConfiguredOnnxDynamicSpatialSize`** — opcjonalnie `VITE_FILMLAB_ONNX_DYNAMIC_SPATIAL` (16–4096, domyślnie 256) dla symbolicznych wymiarów wejścia.
  - Cache **`fetch` → ArrayBuffer** per URL modelu; cache **`InferenceSession.create`** per URL (`executionProviders: ['wasm']`).
  - Cache wyników inferencji (**do 32** wpisów, LRU przez kolejność `Map`), klucz: `buildOnnxSemanticCacheKey(modelUrl, payload)`.
  - **`trySemanticAiMaskOnnxAnalysis`**: metadane sesji (`inputMetadata`) → tensory `float32` o wyliczonym rozmiarze (deterministyczne wypełnienie z payloadu + indeks wejścia); pierwsze wyjście → skalar pewności (`onnxOutputTensorToConfidenceScalar`); merge z heurystyką **`analyzeLocalMaskAiAssistPresetSync`** (35% / 65%) → **`buildAiAssistMaskWithConfidence`** → `backend: 'onnx'`.
- **`src/filmLab/localMaskAiAssistCore.js`** — **`buildAiAssistMaskWithConfidence`** (wspólna geometria maski dla danego confidence); **`analyzeLocalMaskAiAssistPresetSync`** deleguje do niej.
- **`src/vite-env.d.ts`**, **`.env.example`** — dokumentacja `VITE_FILMLAB_ONNX_DYNAMIC_SPATIAL`.
- **`scripts/test-film-lab-onnx-adapter.mjs`** — testy `buildOnnxSemanticCacheKey`, `onnxOutputTensorToConfidenceScalar`; **`npm run test:onnx-adapter`** w `test` i `ci`.

## Testy

- `npm run test:onnx-adapter`: PASS  
- `npm run lint`: PASS  
- `npm run test:i18n-parity`: PASS  
- `npm run test:env-example-parity`: PASS  

## Ryzyka / ograniczenia MVP

- Wejście do modelu to **deterministyczny tensor** dopasowany do kształtu z metadanych — **nie** jest to jeszcze crop bitmapy RAW/preview; podłączenie rzeczywistego obrazu = kolejna iteracja (wymaga kontraktu modelu i mostka z silnikiem).
- Ścieżka ONNX działa na **wątku głównym** przy wyborze AI assist (przed workerem); duże modele mogą blokować UI — akceptowalne przy lazy load + cache + braku domyślnego URL.
- Wynik zależy od **dowolnego** modelu pod URL — ekstrakcja pewności to średnia (+ squash dla logitów); modele segmentacji semantycznej mogą wymagać dedykowanego parsera wyjść.

## Następny etap

- **`12`** Range Control MVP lub **`13`** Warstwy v1 — wg priorytetu w `STAGES.md`; alternatywnie utwardzenie ONNX (pixele wejścia, worker).
