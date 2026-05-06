# HME North Star (Film Lab)

## Rola produktu

Budujemy profesjonalny edytor RAW klasy wyższej niż Lightroom/Capture One, oparty o **Hybrid Masking Engine (HME)**.

## Zasady niepodlegające negocjacji

1. **Non-destructive workflow**: Recipe to prawda źródłowa, eksport jest pochodną renderu.
2. **Maski + Warstwy jako rdzeń**: każda lokalna korekta jest powiązana z warstwą i maską/grafem maski.
3. **AI lokalnie**: brak uploadu zdjęć, ONNX runtime, lazy-loading modeli, cache inferencji.
4. **Simple + Pro**: jeden silnik, dwa poziomy ujawniania złożoności UX.
5. **Global readiness**: UI PL/EN, parity kluczy i spójna terminologia.

## Architektura języka

- **ENGINE i klucze techniczne**: angielski.
- **UI**: polski + angielski (i18n-ready).
- **PL UX**: naturalny język fotograficzny.
- **EN UX**: krótki i techniczny.
- Unikamy żargonu deweloperskiego w UI.

## Pipeline HME

`AI -> Range -> Control Points -> Graph -> Edge -> Layers -> Render -> Export`

## Eksport (Etap 16 — zakres vs roadmapa)

**W produkcie (repo):** eksport rastra **JPEG / PNG / WebP / TIFF / AVIF** z jednego silnika (`filmLabExportEncode`, modal, batch ZIP). **PSD** (jedna warstwa ze spłaszczonego renderu, `ag-psd`, `filmLabExportPsdFromCanvas`) w modalu i batchu — ten sam pill/format co raster z perspektywy UI (`FILM_LAB_EXPORT_MODAL_FORMAT_IDS`); sidecary (maska PNG, before/after, recipe JSON) jak przy rastrze, przy czym **before** przy primary PSD jest kodowany jako **JPEG** (zgodnie z `rasterFf` w silniku). **DNG wariant A (derivative light)** — `filmLabExportDngVariantA`, format **`dng`** w modalu i batchu, ten sam wzorzec sidecarów co PSD, MIME `image/x-adobe-dng`; ograniczenia interoperacyjności z ACR (SPIKE §4.7) i backlog worker — [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md), raport [`stop-2026-04-30-dng-variant-a-product-integration`](../../reports/hme/stop-2026-04-30-dng-variant-a-product-integration.md). **Manifest** `filmLab.export.manifest.v1` z digest SHA-256 oraz spójne **`export.lossyQuality`** dla kodeków stratnych (i w recipe `filmLab.recipe.export.v1`). Blueprint digestu: `FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES` — **optionalScenarios** obejmują raster, **PSD** i **DNG** (whitelist w `filmLabExportFormats.js`). Ustawienia modala w `localStorage` (`filmLab.exportModal.prefs.v1`); CI: `test:film-lab-export-gates` + perf hooki.

**Poza bieżącym MVP eksportu (roadmapa / osobna inżynieria):** **DNG wariant B** (re-wrap), **pełny mosaic RAW** w wyjściu oraz **Linear DNG** / SDK pod pełną zgodność z ACR·Lr — **osobne epiki**; **nie są kolejnym krokiem** po derivative light (`filmLabExportDngVariantA`), **nie są** rozszerzeniem tego samego toru UTIF. SPIKE **§11.3**, plan [`DNG-VARIANT-A-LICENSES-AND-PLAN.md`](DNG-VARIANT-A-LICENSES-AND-PLAN.md) (*Poza MVP wariantu A*). Osobno: **PSD wielowarstwowy**; ewent. **worker** pod enkoder DNG (optymalizacja wariantu A), podniesienie wersji profilu manifestu (SPIKE §3–5, §10.2).

### Decyzja produktowa — zamknięcie Etapu 16 vs PSD/DNG

**2026-04-30:** **Etap 16** jest uznany za **`Done`** w zakresie kontraktu „**raster PRO + manifest v1**” (JPEG/PNG/WebP/TIFF/AVIF, sidecary, digest, CI gates, modal/batch). **PSD i DNG nie są kryteriami ukończenia Etapu 16** i pozostają w backlogu roadmapy eksportu do osobnego etapu / SPIKE (format wyjściowy, warstwy, rozmiary jobów).

Krótko: raster + manifest domknięte; PSD/DNG = kolejna faza po priorytecie, bez blokowania Etapu 16.

**SPIKE + checklisty (PSD, DNG wariant A w repo, DNG wariant B / Linear DNG na roadmapie):** [`docs/hme/EXPORT-PSD-DNG-SPIKE.md`](EXPORT-PSD-DNG-SPIKE.md) — **§4.7 / §10**: SPIKE `spike:dng` — TIFF **PASS** w Photoshopie; `.dng` referencyjny z UTIF może być **FAIL** w Camera Raw; integracja produktowa derivative light jest w **§10.2** — pełna zgodność ACR = osobna inżynieria.

## MVP priorytety

- **P0**: RAW pipeline, layers, AI sky/person, combine masks, luma range.
- **P1** (repo — MVP zakresu foto, bez osobnego „etapu” w `STAGES.md`):
  - **Chroma range**: zakres saturacji HSL dla maski „color” (`colorMaskChromaMin` / `colorMaskChromaMax`, `filmLabLocalMaskRangeMath.js`).
  - **Control points (workflow)**: próbkowanie środka odcienia z podglądu — **Shift + klik** przy masce color (`FilmLabCanvasArea.jsx`, `rgbHueFromBytes.js`); pełne punkty na krzywych RGB jak wcześniej (`FilmLabCurveHandlers.js`).
  - **Edge brush (MVP)**: **Pędzel: krawędź** — znaczki ważone Sobel lumy (`brushMaskEdgeSensitivity`, `canvasLumaSobelSample.js`); recipe **`semantic.brush_strokes.v1`** eksportuje `edgeSensitivity` + `edgeWeightedStrokeCount` (payload worker / debug).
  - **Status repo (P1):** trzy elementy powyżej są zaimplementowane w silniku i maskach lokalnych (m.in. `FilmLabLocalMaskWorkbench.jsx`, `filmLabLocalMaskRangeMath.js`, `npm run test:local-mask-p1`); UI PL/EN — `filmLab.slider.*` + podpowiedzi w `filmLab.localMask` (m.in. chroma, krawędź pędzla, Shift+klik); smoke QA: [`LOCAL-MASK-P1-SMOKE.md`](LOCAL-MASK-P1-SMOKE.md).
  - **P2**: **Depth mask (proxy w podglądzie)**: tryb Głębia — **pędzel × zakres jasności proxy** (`depthMaskMin` / `depthMaskMax`, luminancja jako zastępcza „głębia”; `filmLabLocalMaskRangeMath.js`); **mapa głębi / ONNX w repo** — `depthMapSource` + `filmLabDepthOnnxInference.js` + env z `.env.example`, raport domknięcia [`stop-2026-05-02-depth-onnx-integration.md`](../../reports/hme/stop-2026-05-02-depth-onnx-integration.md), SPIKE [`DEPTH-REAL-MAP-SPIKE.md`](DEPTH-REAL-MAP-SPIKE.md); dalsze modele (wiele wejść, inne tensory) = iteracje. **Generative AI (UI + recipe)**: przełącznik `generativeAiStubIntent` + `semantic.generative_stub.v1` (bez renderu); **lokalny ONNX / inference** — [`GENERATIVE-LOCAL-ONNX-SPIKE.md`](GENERATIVE-LOCAL-ONNX-SPIKE.md); **CMYK soft proof (MVP)**: `cmykSoftProofEnabled` + `filmLabCmykSoftProofApprox.js` (bez ICC); eksport sRGB; pełne ICC = kolejna faza.

## Runtime i wydajność

- Primary: WebGPU; fallback: WebGL/CPU.
- Ciężkie operacje: workery + tile-based processing.
- KPI docelowe (wartości referencyjne w `src/filmLab/filmLabPerfKpiTargets.js`, gate CI w `scripts/film-lab-export-perf-gates.mjs`):
  - slider latency < 16ms,
  - AI mask < 1.5s,
  - crash-free > 99.5%,
  - brak OOM dla 45MP.

## Pułapki i zabezpieczenia

- OOM: obowiązkowe tile processing i limity pamięci.
- Lag UI: worker scheduling i odciążenie main thread.
- AI latency: lazy-load + cache + degradowalny fallback.
- Spójność jakości: wspólny kontrakt renderu dla wszystkich runtime tiers.

## Po programie etapów 1–18 (`STAGES.md`)

Plan osiemnastu etapów HME jest zamknięty. Kolejne inżynieriowe kierunki mapuj na **MVP P1 / P2** (powyżej), kontrakt eksportu poza rastrem ([`EXPORT-PSD-DNG-SPIKE.md`](EXPORT-PSD-DNG-SPIKE.md)), albo osobne initiative — bez sztucznego „etapu 19”, dopóki nie zaktualizujesz oficjalnie tabeli w `STAGES.md`.

**Biblioteka DAM / filmstrip (web):** kontrakt [`DAM-PREVIEW-CONTRACT.md`](DAM-PREVIEW-CONTRACT.md), cache OPFS [`filmLabOpfsPreviewCache.js`](../../src/filmLab/opfs/filmLabOpfsPreviewCache.js), pas Canvas [`FilmLabFilmstripCanvas.jsx`](../../src/filmLab/FilmLabFilmstripCanvas.jsx), integracja w [`FilmLabLibraryWorkspace.jsx`](../../src/FilmLabLibraryWorkspace.jsx); raport zamknięcia [`stop-2026-04-30-dam-filmstrip-mvp.md`](../../reports/hme/stop-2026-04-30-dam-filmstrip-mvp.md).
