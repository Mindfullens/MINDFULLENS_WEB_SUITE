# MindfulLens Film Lab - Zintegrowany Plan Strategiczno-Wdrozeniowy v3.1

Status: Active roadmap after stabilization  
Date: **2026-04-26** (ostatnia synchronizacja + **weryfikacja repo ↔ plan**; build w kodzie: **sv-2026.04.25-243** — `src/filmLab/buildInfo.js`)

Powiazane dokumenty w repo:

- Mapa dokumentacji w `docs/`: `[README.md](README.md)`
- Plan sprintowy 90 dni (backlog skorelowany z roadmapa): `[PLAN_SPRINTOWY_90_DNI.md](PLAN_SPRINTOWY_90_DNI.md)`
- Wykonanie Sprintu 1 (stabilizacja): `[SPRINT_1_EXECUTION.md](SPRINT_1_EXECUTION.md)`

Ten dokument zastępuje roboczy plan v3.1 wklejony poza repo i usuwa z aktywnej roadmapy elementy, ktore sa juz wdrozone. Historyczny plan sprintowy pozostaje w `docs/PLAN_SPRINTOWY_90_DNI.md`, a zamkniecie pierwszej stabilizacji jest opisane w `docs/SPRINT_1_EXECUTION.md`.

## 0. Skrót: co już jest vs. co zostaje (2026-04-26)

Ta sekcja **nie zastępuje** szczegółów w §2–§5 — służy szybkiej orientacji przed planowaniem sprintu.

### 0.1 Już mamy (nie wracać jako „nowe zadanie”, tylko regresje / utrzymanie)

| Obszar | Stan skrótowy |
|--------|----------------|
| **Stabilność / architektura** | Worker proxy, `postMessage` z transferami, scheduler bez pętli, modularny shell (`FilmLabPro` + `src/filmLab/`), undo/redo, auto-save sesji, eksport JPEG/EXIF, batch ZIP — szczegóły §2. |
| **GPU preview dziś** | WebGL/WebGL2 + CPU w workerze; szybki podgląd główny (`fastPreviewRenderer`) z opcjami FBO 16f / atlas LUT / `highp` przy FBO — §5.1.1 i §189. |
| **WebGPU — diagnostyka** | `webGpuEnvironment.js` (main + worker), trwałe device w workerze przy `VITE_FILMLAB_WEBGPU_PROXY`, `proxyWebGpuRenderer.js` + WGSL współdzielony z sondą main; panel Render Debug + eksport DIAG (`useFilmLabExportDebugReport`). |
| **Proxy — limity / kafle** | `proxyComputeSize`, downscale, fit 2D/3D, opcjonalne `PROXY_OUTPUT_TILES` (GPU + composite, WebGPU readback kafelkowy), CPU nominal parity przy wielu kaflach, opcjonalny CPU yield — §3 Etap 1. |
| **Parity / telemetria** | LUT 3D format W vs main, readback 1×1 **rb0** (main) vs worker (`proxyWorkerWebGpuReadback*`, `webGpuReadbackMainWorkerRgba3Match` w DIAG); E2E v1–v3 + pan/aux/kbd; host sched→rAF opcjonalnie — §189. |
| **A/B main preview — baseline** | Realny tor WebGPU na wątku głównym pod flagą + rollout health/gate/E2E w badge/DIAG; **powtarzalny protokół pomiaru i arkusz wyników:** §9.12 (`npm run dev:webgpu:main-ab` / `build:preview:webgpu:main-ab`, eksport DIAG). |
| **Wersja buildu** | Etykieta `SERVICE_BUILD_LABEL` w stosie **Status** na canvasie (pod jakością), nie w stopce — §2, `FilmLabCanvasPipelineOverlays`. |
| **Jakość / bramki** | `npm run test:deep-audit`, `test:proxy`, testy E2E pointer, regresja Film Lab — §5.1 końcówka. |

### 0.2 Nadal otwarte (priorytet wykonawczy)

1. **Etap 1 — pełny WebGPU jako główny podgląd** (nie tylko sonda + worker proxy): współdzielenie lub przeniesienie pipeline z `proxyWebGpuRenderer` na główny wątek przy zachowaniu fallbacków; **rgba16float** tam, gdzie dziś w praktyce wciąż dominuje 8-bit / LDR upload; prawdziwy **SAB** w pipeline (dziś tylko spike telemetrii COOP/COEP).
2. **Etap 1 — dopracowanie wydajności** — CPU „jak GPU” pod kątem podziału pracy (opcjonalnie dalsze kroki przy `PROXY_CPU_YIELD`); **pełna** telemetria E2E klatki tam, gdzie jeszcze brakuje interpretacji w UI/DIAG.
3. **Etap 2 — RAW parity** — `libraw.wasm`, DCP/ICC, recovery na danych RAW, Lensfun/LCP-style; bridge obecny = stan przejściowy.
4. **Etap 3 — maski + AI lokalne** — brush / gradienty / range masks, modele web-native (subject/sky), denoise ONNX/WebGPU.
5. **Etap 4 — workflow PRO** — SQLite OPFS, XMP, culling, collections, batch sync (persist sesji ≠ katalog).
6. **Etap 5 — przewaga** — Smart Consistency, Adaptive Emulation, Scientific Film Mode, benchmark / eksport QA (częściowo już DIAG).

Szczegółowe KPI i zakres etapów: §3–§5 poniżej.

## 1. Cel Produktowy

**Poziom referencyjny (nie do „od czapy”):** stabilność i kompletność workflowu zbliżone do **Capture One** i **Adobe Lightroom Classic** — jakość RAW, precyzja koloru i gradacji, maski lokalne, praca seryjna i katalog. To jest **dolna granica** oczekiwań użytkownika PRO: jeśli czegoś brakuje względem tej pary, traktujemy to jako **lukę do zamknięcia**, nie jako „nice to have”.

**Ambicja MindfulLens — zrobić wyraźnie lepiej:** nie odtwarzać desktopu 1:1, tylko **wyprzedzać** tam, gdzie ma to sens: **web-native** (bez instalacji, jeden link, aktualizacje od razu), **prywatność i lokalność** (AI i ciężkie operacje bez przymusowego chmury), **film look i spójność serii** jako pierwsza klasa (nie dodatek do „generic develop”), oraz **mierzalna jakość** (telemetria, DIAG, regresje — to, czego brakuje wielu klasycznym aplikacjom z perspektywy małego zespołu). Przy tym **latencja podglądu** i **przewidywalność** na docelowym GPU/WebGPU muszą być konkurencyjne z dobrym desktopem — inaczej „lepiej” nie ma prawa bytu.

Cztery filary zamykające luki wobec LR/C1 i jednocześnie niosące przewagę:

- **Wydajność:** główny rendering GPU/WebGPU, tile rendering, przewidywalna latencja przy 50MP+ i przeciąganiu suwaków.
- **Jakość RAW:** `libraw.wasm`, DCP/ICC, recovery i korekcje obiektywów na danych RAW (nie tylko obróbka już zdemozaikowanego obrazu wyświetlanego).
- **Lokalne edycje i AI:** maski manualne i semantyczne, denoise i guided edits bez wyciekania materiału na zewnątrz.
- **Workflow PRO:** katalog, XMP, culling, batch sync i wersjonowanie pracy w skali sesji.

Nie planujemy ponownie funkcji, które już są w kodzie. Kolejne iteracje §0–§5 są ułożone tak, by najpierw domykać fundament pod ten poziom referencyjny, potem wzmacniać różnicowanie.

## 2. Juz Wdrozone - Poza Aktywna Roadmapa

Te elementy nie powinny wracac jako aktywne zadania implementacyjne. Moga pozostac tylko jako regresje, testy lub dokumentacja stanu.

- Stabilizacja workera renderujacego: `src/engine/workers/proxyRenderWorker.js`.
- Transfery przez `postMessage` z lista transferu dla pikseli i ramek: `src/engine/useFilmLabEngine.js`, `src/engine/workers/proxyRenderWorker.js`.
- Scheduler `processPending` bez rekurencyjnego zapetlenia: `src/engine/workers/proxyRenderWorker.js`.
- Czestsze przerywanie renderu i odrzucanie przestarzalych ramek: `src/engine/useFilmLabEngine.js`, `src/engine/workers/proxyRenderWorker.js`.
- Wspolny modul matematyki koloru: `src/engine/colorMathShared.js`.
- Walidacja LUT przed transferem do workera: `src/engine/lut/cubeLutPayload.js`.
- Wymuszony re-render po gotowym LUT: `src/engine/useFilmLabEngine.js`.
- Rozbicie dawnego monolitu `FilmLab.jsx` na `FilmLabPro`, shell i hooki w `src/filmLab/`.
- Auto-save i restore sesji przez IndexedDB/idb-keyval: `src/engine/filmLabSessionPersist.js`, `src/filmLab/useFilmLabSessionPersistenceEffects.js`.
- Undo/redo snapshotowe: `src/filmLab/useFilmLabUndoRedo.js`.
- Eksport JPEG z EXIF i batch ZIP: `src/engine/useFilmLabEngine.js`, `src/engine/batchProcessor.js`, `src/FilmLabExportModal.jsx`.
- Obecny GPU path jako WebGL/WebGL2 plus CPU fallback: `src/engine/workers/proxyGpuRenderer.js`, `src/engine/preview/fastPreviewRenderer.js`.
- Katalog presetow/film stocks i filtrowanie profili: `src/filmLab/useFilmLabFilmCatalog.js`, `src/engine/filmProfiles.js`.
- Porownanie Przed/Po przy aktywnym kadrowaniu (level/crop): przed wklejeniem surowego `ImageData` w trybie porownania bufor roboczy jest przywracany do pelnych wymiarow zrodla, zeby uniknac obcinania i zlego aspect w widoku — `applyCompare` w `src/engine/useFilmLabEngine.js`.
- W trybie `npm run dev` (Vite): rozszerzona etykieta `wersja serwisowa` (timestamp załadowania pl-PL + opcjonalny SHA z `git rev-parse --short HEAD`) jest widoczna po włączeniu **Status** na pasku narzędzi — na dole stosu statusu na canvasie, **pod** wierszem jakości (`FilmLabCanvasPipelineOverlays`, klasa `service-build-badge-stack`); źródło tekstu: `src/filmLab/buildInfo.js`, `vite.config.js` (`import.meta.env.VITE_FILM_LAB_GIT_SHA`).
- **`FilmLab.jsx`:** cienki re-export do `FilmLabPro.jsx` (ścieżka wejścia bundlera bez duplikacji logiki).

### 2.1 Weryfikacja „już mamy” ↔ stan repo (2026-04-26)

Nie planuj ponownie poniższych — pliki / symbole **istnieją** w drzewie źródeł (próbkowanie `grep` / struktura katalogów):

| Twierdzenie w planie | Gdzie to zweryfikować |
|----------------------|------------------------|
| Worker + `processPending`, WebGPU boot w workerze | `src/engine/workers/proxyRenderWorker.js` (`processPending`, `webGpuWorkerBootPromise`) |
| Transfery `postMessage` + bitmap/pixels | `src/engine/useFilmLabEngine.js`, ten sam worker |
| Proxy WebGPU renderer + WGSL | `src/engine/workers/proxyWebGpuRenderer.js`, `src/engine/workers/proxyWebGpuShaders.wgsl` |
| Sonda WebGPU (adapter/device **probe** z `device.destroy` po limitach) | `src/engine/webGpuEnvironment.js` (`getOrProbeWebGpuAdapter`, `getOrProbeWebGpuDevice`) |
| **Trwały** `GPUDevice` — worker proxy + sonda main (**osobno** od probe powyżej) | `getOrCreatePersistentWebGpuDevice` w workerze (przy `VITE_FILMLAB_WEBGPU_PROXY`); `src/filmLab/filmLabMainThreadWebGpuPreview.js` (etykieta `MAIN_THREAD_DEVICE_LABEL`) |
| Kafle wyjścia + composite | `src/engine/proxyOutputTileComposite.js`, flagi `VITE_FILMLAB_PROXY_OUTPUT_TILES` w workerze |
| CPU yield co N wierszy | `getProxyCpuYieldEveryRowCount` / `VITE_FILMLAB_PROXY_CPU_YIELD_EVERY` w `proxyRenderWorker.js` |
| Readback W vs main (panel + DIAG) | `formatWebGpuReadbackMainWParityLine` w `FilmLabRenderDebugPanel.jsx`; `webGpuReadbackMainWorkerRgba3Match` w `useFilmLabExportDebugReport.js` |
| Wersja serwisowa w UI | `SERVICE_BUILD_LABEL` w `FilmLabCanvasPipelineOverlays.jsx` + `service-build-badge-stack` w `filmLabPage.css` |
| RAW **bridge** (nie libraw.wasm) | `src/engine/pipeline/raw/rawPipelineController.js`, `rawDecode.worker.js`, `ingestSource.js` — to jest stan **przejściowy** względem Etapu 2 |
| **Brak w `src/`:** `libraw.wasm`, SQLite katalogu, zapisu XMP w silniku | `grep` po workspace — nie wdrażać „od zera” bez sprawdzenia; Etap 2/4 nadal otwarte |

## 3. Aktywna Roadmapa

### Etap 1 - Performance Foundation

Cel: zastapic obecny WebGL/WebGL2 preview docelowym renderingiem WebGPU i przygotowac silnik pod obrazy 50MP+.

Zakres:

- glowny backend WebGPU z fallback chain: WebGPU -> WebGL/WebGL2 -> CPU,
- tekstury i LUT w formatach high precision, docelowo `rgba16float`,
- tile rendering dla duzych plikow i ograniczenia presji pamieci,
- zero-copy tam, gdzie pozwala platforma, w tym `SharedArrayBuffer` po spelnieniu wymagan izolacji,
- telemetry i quality gates dla czasu renderu, backendu i fallbackow,
- juz teraz: twardy gate `npm run test:deep-audit` (`scripts/deep-audit-film-lab.mjs`) raportuje percentyle czasu kosztu szybkiej sciezki `buildFastPreviewAdjustments` (to nie zastepuje pomiaru pelnego renderu w UI, ale jest realnym sygnalem regresji wydajnosci),
- test zgodnosci `cubeIndex()`/samplowania LUT z Resolve jako walidacja, nie jako nowe zadanie implementacji LUT.

KPI:

- preview latency suwaka: ponizej 16 ms median na docelowym backendzie,
- brak widocznych dropoutow profilu LUT podczas drag,
- stabilny fallback bez zatrzymywania pracy uzytkownika.

**Pomiary ręczne (baseline WebGPU vs WebGL na main):** runbook sesji, minimalny zestaw pól DIAG i szablon tabeli wyników — **§9.12** (nie zastępuje `test:deep-audit`, uzupełnia go o E2E w prawdziwym UI).

**Juz w repo (fragment Etapu 1, tylko diagnostyka; od 2026-04-25):**

- `src/engine/webGpuEnvironment.js` — sonda API (`getWebGpuApiExposure`), `requestAdapter` + metadane (`getOrProbeWebGpuAdapter`), jednorazowa sonda `requestDevice` + zrzut kluczowych `limits` + `device.destroy()` (`getOrProbeWebGpuDevice`), cache na poziomie modułu. **Uwaga:** to **nie** wyklucza trwałego `GPUDevice` w innych ścieżkach — worker proxy (`VITE_FILMLAB_WEBGPU_PROXY`) i sonda podglądu głównego używają `getOrCreatePersistentWebGpuDevice` (zob. §2.1); tu chodzi o lekki probe bez utrzymywania device po odczycie limitów.
- `useFilmLabEngine` / `FilmLabRenderDebugPanel` / `useFilmLabExportDebugReport` — wiersze WebGPU (API, adapter, device) w panelu Render Debug i pole `environment.webgpu` w eksporcie JSON (DIAG).
- `proxyRenderWorker` — import tego samego `webGpuEnvironment.js` i asynchroniczna sonda po `self.onmessage` (wiadomosc `webgpuWorkerProbe` do wątku głównego, osobny cache w bundlu workera; porownanie w UI: **W** · API/adapter/device). W eksporcie: `environment.webgpuWorker`.
- Przy `VITE_FILMLAB_WEBGPU_PROXY=1`: `getOrCreatePersistentWebGpuDevice`, `globalThis.__mlWgpu`, `proxyWebGpuShaders.wgsl` + `proxyWebGpuRenderer.js` (paritarny shader do WebGL2), w `ensureGpuRenderer` probny WebGPU z fallbackiem do WebGL2 i `webGpuUnusable` przy awarii.
- **Proxy path hardening (ciąg Etapu 1 / tylko worker + diagnostyka, 2026-04+):** wspólne moduły `proxySourceDownscale.js` (fit + staged downscale + budżet pikseli), `proxyGpuLut3dLimit.js` / `proxyGpu2dRectLimit.js`, `proxyNominalOutputFit.js` — wejście do limitu 2D tekstury, preflight 3D LUT (uniknięcie `setGpuFailure` przy oversize LUT; fallback CPU), wyjście `computeProxySize` docięte do `maxTextureDimension2D` na GPU i na CPU (gdy znany limit z istniejącego renderera), telemetria w `FilmLabRenderDebugPanel` / `useFilmLabExportDebugReport` (m.in. `proxyWorkerProxyOutputFitted`, wymiary nominalne→faktyczne, ms downscale wejścia, `isProxyWorkerProxyOutputFitted` w etykietach Preview path, `getProxyWorkerOutputFitStatusLabel` → `proxyWorkerOutputFitStatusLabel`, teoretyczna siatka kafli @ max2D: `proxyWorkerOutputTileCountNominal` / `Target`, `getProxyWorkerOutputTileStatusLabel`). **Nominalne** wymiary przed fitem 2D/3D: wspólny `src/engine/proxyComputeSize.js` (`computeProxySize`, `DEFAULT_PROXY_MAX`) importowany w `proxyRenderWorker.js`; regresje w `test:proxy-downscale`. Regresje: `npm run test:proxy` (łączy `test:proxy-webgpu` + `test:proxy-downscale` + `test:proxy-tiles`), inwarianty w `test:deep-audit`.
- **Nie zrobione / niedokończone** w ramach tego samego etapu: **pełny** łańcuch `rgba16float` od źródła przez cały grading (upload HDR / pełna precyzja wszędzie, nie tylko fragmenty) — **częściowo już jest:** FBO `RGBA16F` + blit i atlas LUT 16f (szybki podgląd + worker WebGL2 przy udanej sondzie), `highp` w shaderze przy FBO 16f, WebGPU worker z `rgba16float` tam gdzie `probe*` pozwala; patrz §5.1.1 pkt 1. **Nadal otwarte:** wielokrotne przejścia CPU jak w GPU (podział pracy na kaflach — dziś jedna pętla na pełnym buforze poza opcjonalnym **yield** wierszy: `VITE_FILMLAB_PROXY_CPU_YIELD_EVERY` w `renderProxyFrame`); **pełna** telemetria kosztu klatki end-to-end (poza `test:deep-audit` i panelami); **spike SAB:** `getSharedArrayBufferHostSnapshot` + panel / DIAG — **bez** realnego bufora współdzielonego w pipeline; **główny** podgląd koloru na wątku głównym nadal WebGL (`createFastPreviewRenderer`) — sonda `probeMainThreadWebGpuPreviewStatus` ≠ pełny shader zastępujący podgląd. **W repoz (2026-04+):** gdy `VITE_FILMLAB_PROXY_OUTPUT_TILES=1` i nominal >1 kafla @ max2D, ścieżka CPU w workerze (`renderProxyFrame`) używa **pełnego bufora nominalnego** (parity wymiarów z GPU + kafelkami), zamiast pojedynczego `fitNominalToMaxTexture2dEdge`. **Opcjonalnie włączane:** `VITE_FILMLAB_PROXY_OUTPUT_TILES=1` — pełna rozdzielczość nominalnego proxy w wielu przejściach GPU (`uOutputUv` / `U.c6`) + złożenie w `proxyOutputTileComposite.js`; **WebGL2:** `returnPixels` + `readPixels` + `flipRgba8ImageYInPlace`; **WebGPU:** `renderToRgba8Pixels` → tekstura RENDER+COPY, `copyTextureToBuffer` + `tightRgba8FromPaddedReadback` (także BGRA→RGBA); ostateczny fallback: staging 2D; gdy brak kafelków — nadal pojedynczy pass z `fit` do limitu 2D.

### Etap 2 - RAW Parity

Cel: przejsc z architektury RAW bridge/SIPS/QuickLook do prawdziwego in-browser RAW pipeline.

Zakres:

- `libraw.wasm` dla CR2/CR3/NEF/ARW/RAF/DNG i innych formatow RAW,
- tryby demosaikacji: RCD dla live preview, AMaZE dla final/export,
- profile DCP i ICC, macierze kamery, krzywe tonalne i fallback profili,
- highlight recovery i shadow recovery oparte o dane RAW, nie tylko display RGB,
- Lensfun/LCP-style korekcje: dystorsja, winieta, lateral CA,
- defringe i moire jako osobne narzedzia jakosciowe,
- regresje referencyjne: Delta E, SSIM i guard czarnej klatki.

KPI:

- RAW decode preview: ponizej 1.2 s dla typowych plikow testowych,
- Delta E kolorow: ponizej 2.0 na zestawie referencyjnym,
- final render bez widocznych regresji wzgledem aktualnych film looks.

### Etap 3 - Lokalne Maski i AI

Cel: dodac lokalne edycje i lokalne AI bez serwera.

Zakres:

- maski manualne: brush, linear gradient, radial gradient,
- luminance range i color range z podgladem maski,
- layer stack lokalnych korekt: exposure, color, texture, clarity, denoise amount,
- subject i sky mask przez MediaPipe/SAM-lite lub rownowazny model web-native,
- AI denoise przez ONNX Runtime Web/WebGPU z tile processing,
- upscale przez model lokalny lub opcjonalny tryb high-quality offline,
- Guided Pro Edit: auto tone, sugestie korekt i match look do serii.

KPI:

- generation maski subject/sky: ponizej 100 ms dla preview,
- denoise 4K: ponizej 1 s na wspieranym GPU,
- wszystkie maski zapisywalne w recipe i odtwarzalne po restore.

### Etap 4 - Workflow PRO

Cel: zrobic z Film Lab narzedzie do sesji, selekcji i pracy seryjnej.

Zakres:

- katalog SQLite w OPFS z indeksowaniem miniatur i metadanych,
- XMP sidecar read/write dla kompatybilnosci workflow,
- rating, flags, colors, collections i smart collections,
- culling oparty o embedded JPEG preview z przelaczaniem zdjec ponizej 80 ms,
- snapshoty, virtual copies i preset versioning,
- batch sync z wyborem parametrow do synchronizacji,
- makra/action recorder dla powtarzalnych workflow,
- delivery: proof gallery, import selekcji klienta i output presets.

KPI:

- culling 100 zdjec minimum 2x szybciej niz Lightroom w scenariuszu testowym,
- utrata pracy: 0 procent przy refresh/crash w obrebie zapisanej sesji,
- delivery workflow success rate powyzej 99 procent na zestawie testowym.

### Etap 5 - Przewaga Rynkowa

Cel: zbudowac funkcje, ktore wzmacniaja przewage film look + web-native + local AI.

Zakres:

- Smart Consistency Engine dla wyrownania looku w seriach,
- Adaptive Film Emulation dopasowujacy sile emulacji do sceny,
- Scientific Film Mode z mierzalna jakoscia koloru i kontrolowanym pipeline,
- benchmark mode dla porownan wydajnosci i jakosci,
- eksport diagnostyczny do QA/regresji i komunikacji z uzytkownikami PRO.

## 4. Mapa Z Poprzedniego Planu

- Dawny Etap 0/F0: zamkniety jako stabilizacja, nie planowac ponownie.
- Dawny Etap 1: ograniczony do realnych brakow performance: WebGPU, high precision, tile rendering, SAB i telemetry.
- Dawny Etap 2: aktywny jako RAW parity, bo obecny bridge RAW jest stanem przejsciowym.
- Dawny Etap 3: aktywny jako lokalne maski i AI, bo w repo nie ma jeszcze brush/linear/radial ani masek ML.
- Dawny Etap 4: aktywny jako katalog PRO, bo istnieje persist sesji, ale nie ma SQLite/XMP/culling.
- Dawny Etap 5: aktywny jako R&D i funkcje przewagi, bez osobnego `MASTER_PLAN_50.md`.

## 5. Priorytety Wykonawcze

Jesli robimy tylko piec rzeczy, kolejnosc pozostaje:

1. WebGPU rendering i tile pipeline.
2. RAW pipeline: `libraw.wasm`, DCP/ICC i recovery.
3. Maski lokalne: brush, linear, radial, range masks.
4. AI: subject/sky, denoise i guided edits.
5. Katalog PRO: SQLite OPFS, XMP, culling i batch sync.

### 5.1 Nastepna iteracja kodu (punkt 1 z listy — performance)

Kolejnosc praktyczna, spojna z sekcja 3 Etap 1 (ostatni akapit „Nie zrobione” i opcjonalne kafle):

1. **rgba16float / wyzsza precyzja** — rozszerzenie sciezki GPU (najpierw WebGL2, potem WebGPU) dla tekstur roboczych i LUT w miejscach, gdzie dzis dominuje sciezka 8-bit; uzgodnic z `test:deep-audit` i ograniczeniami `maxTextureDimension2D`.
2. **Spojnosc kafelkow CPU** — dopasowac fallback CPU do tej samej polityki dzielenia obrazu co proxy (istniejace moduly: m.in. `proxySourceDownscale.js`, `proxyNominalOutputFit.js`, opcjonalnie `VITE_FILMLAB_PROXY_OUTPUT_TILES` / `proxyOutputTileComposite.js`), zeby roznica GPU vs CPU byla tylka w szybkosci, nie w kadrowaniu. **Opcjonalnie dev:** `VITE_FILMLAB_PROXY_MATCH_PREVIEW=1` + `resolveProxyMaxForPreviewBuffer` w `useFilmLabEngine` — `proxyMax` workera min. jak dluzsza krawedz bufora preview, bez drugiego downscale w `computeProxySize` wzgledem CPU (wyzszy koszt drag). Skroty: `npm run dev:match-proxy`; z szybkim WebGL2: `dev:fast-webgl2:match` / `dev:fast-webgl2:match:webgpu`; build+`vite preview` z tymi samymi `VITE_*`: `build:preview:fast-webgl2:match` (i wariant :webgpu).
3. **Telemetria E2E** — jeden pomiar czasu od decyzji uzytkownika do pikseli w `canvas` (warstwa UI), uzupelniajacy istniejace pomiary skladowych i workera; bez zastepowania `test:deep-audit`. **W repoz (2026-04+):** (a) **schedule→canvas** — `previewE2eIntentToPresentMs` + `previewE2ePath`; (b) **drag→canvas (v2)** — `previewE2eDragToPresentMs` (pierwsze `isAdjusting`); (c) **pointer→canvas (v3)** — `markFilmLabE2ePointerDown` m.in. suwaki (`useFilmLabSliderWorkbench`), `clear` w `handleSliderEnd`; `e2eIsPanning` w `useFilmLabEngine` (pan w `useFilmLabViewportZoomPan`); rękojeść kadru — `setFilmLabE2ePointerAuxSession` w `useFilmLabCropDrag`; prostowanie — `mark` w `useFilmLabStraightenDrag`; krzywe kolorów — `mark` w `FilmLabCurveHandlers` na `pointerdown`; kółko gradacji (strefa) — `useFilmLabColorGradeWheelAdjustSession` + `ColorWheel` (`onAdjustSessionStart` / `onAdjustSessionEnd`); **klawiatura** — `markFilmLabE2eKeyboardE2eIntent` w `useFilmLabGlobalKeydown` (m.in. porównanie, zoom, strzałki z pan, auto A/K, 1:1, Enter/Escape w crop, **Cmd/Ctrl+Z** / **Shift+Cmd/Ctrl+Z** / **Ctrl+Y** (ponów, bez Cmd na macOS) cofnij/ponów gdy jest historia) oraz w `useFilmLabClipboardShortcuts` (Ctrl/Cmd+V wklej przepis). Uniwersalny odczyt: `readPreviewE2ePointerContext` w silniku; po prezentacji klatki: `takePreviewE2ePointerToPresentMs` czyści sesję klawiatury.
4. **WebGPU jako glowny podglad** — po `ensureGpuRenderer` / `proxyWebGpuRenderer.js` i probnym WebGPU w workerze: przeniesc lub wspoldzielic pipeline glownego podgladu (glowny watek), zachowujac lancuch fallbackow z sekcji 3.

Punkty 2–4 mozna planowac rownolegle w osobnych galeziach, jesli nie ma jednej osoby na caly Etap 1.

#### 5.1.1 Zatwierdzona kolejka — nastepne 5 krokow (2026-04-25)

1. **rgba16float / polpelna precyzja poza szybkim WebGL2** — **krok w repo:** wspolny `src/engine/webgl2Rgba16fFboProbe.js` (`probeWebgl2Rgba16fFboUsable`) uzywany w `fastPreviewRenderer` i w `proxyGpuRenderer`; wejscie workera WebGL2 nadal RGBA8. **W workerze (2026-04+):** gdy sonda OK i brak `VITE_FILMLAB_FAST_FBO16F=0` — rysowanie do FBO `RGBA16F` + blit do canvas (jak szybki podgląd); telemetria `proxyWorkerWebGlFbo16fBlit` + panel (sonda + blit). **3D LUT w workerze (2026-04+):** `webgl2Rgba16f3dLutProbe.js` — `probeWebgl2Rgba16f3dLutUsable` + upload `texImage3D` w `RGBA16F`+`HALF_FLOAT` (profil + look) gdy sonda 3D i FBO+blit; wspolny `webglU8RgbaToHalfFloat.js` (`u8RgbaToHalfFloatRgbaForTexImage`) z szybkim podgladem (atlas 2D) i workera; `proxyWorkerWebGl3dLutRgba16f` + wiersz **„W · GL 3D LUT”** (`rgba16f` / `rgba8`). **Dalej:** dalsze opt. probkowania tam gdzie sensowne.
2. **Spojnosc wymiarow CPU vs proxy** — **krok w repo:** `getNominalProxyRenderSize` w `proxyComputeSize.js` (DRY: worker `setSource` + `renderProxyWithWorker`); przy CPU `quality=preview` — telemetria `cpuParityNominal*`, `cpuParityMatchNominal` (czy W×H bufora = nominal jak w workerze); panel **„CPU · nominal = bufor”**; inwarianty: `test:proxy-downscale` + `test:deep-audit`. **Opcjonalnie (2026-04):** `VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL=1` — 2D downscale wejścia do nominalu przed pętlą pikseli (`cpuParityDownscaled` w panelu / DIAG; drogie). Skróty: `dev:cpu-preview-match-nominal`; `dev:fast-webgl2:match:cpu-nominal` (wariant :webgpu); pełne `build`+`preview`: `build:preview:fast-webgl2:match:cpu-nominal` (wariant :webgpu) — te same `VITE_*` co w dev, ale w `dist`. **Worker (CPU) vs kafelki GPU (2026-04+):** gdy `VITE_FILMLAB_PROXY_OUTPUT_TILES` i nominal >1 kafla — `renderProxyFrame` liczy pełny bufor nominalny (nie `fit` do max2D), telemetria `proxyWorkerCpuFullNominalParity`; opcj. `VITE_FILMLAB_PROXY_CPU_YIELD_EVERY` — `async` + `setTimeout(0)` co N wierszy; panel **„W · CPU yield”**; DIAG `proxyCpuYieldEvery`; skrypty `dev:proxy-output-tiles:yield`, `build:preview:proxy-cpu-yield` itd.
3. **WebGPU podglad w watku glownym** — **w repo (sonda Etapu 1):** `probeMainThreadWebGpuPreview()` — `getOrCreatePersistentWebGpuDevice` + bufor `queue.submit` + `maxTextureDimension2D` + canvas `configure` + clear + **WGSL** (`createShaderModule` / `createRenderPipeline` / `draw(3)` trójkąt + 1x1 `writeTexture` + `textureSample` + **importer `proxyWebGpuShaders.wgsl?raw` z `fmain` + `UBlock` + VBO** jak w `createProxyWebGpuRenderer`) — `mainThreadWebGpuSolidDrawPass`, `mainThreadWebGpuTextureDrawPass`, `mainThreadWebGpuProxyShaderDrawPass` + po zaladowaniu wejscia: `downscaleSourceCanvasRgba8ForWebGpuHostProbe` + `probeMainThreadWebGpuHostSourceRgba8ProxyPass` — `mainThreadWebGpuHostSourceProxyPass`, panel **rys: / tex: / proxy: / src: tak|nie**; `mainThreadWebGpuCanvasClearPass` (**canvas: tak/nie**); `probeMainThreadWebGpuPreviewStatus()` = wrapper (string). Pelny kolor: `createFastPreviewRenderer` (WebGL) do dalszego kroku.
4. **Telemetria E2E host (opcjonalnie)** — **czesciowo w repo:** `VITE_FILMLAB_E2E_HOST_SCHED_RAF=1` — `previewE2eHostSchedToRafMs` (schedule → pierwszy host `rAF` z praca podgladu / post do workera), panel „E2E (sched→rAF host)”, DIAG `flags.env.e2eHostSchedRaf` + `previewE2eHostSchedToRafMs`; uzupelnia interpretacje `previewE2eIntentToPresentMs`.
5. **SAB / pelna klatka end-to-end** — **spike w repo:** `getSharedArrayBufferHostSnapshot()` (`sabConstructible`, `crossOriginIsolated`, `detail`), panel „Host · SharedArrayBuffer”, eksport DIAG; **wciąż otwarte:** rzeczywisty transfer klatki przez SAB, COOP/COEP w `vite`/deploy i polityka produkcyjna.

**Minimum regresji przed releasem (repo):** `npm run test:deep-audit` + `npm run test:proxy` + `npm run test:e2e-pointer` (pelen zestaw: `npm run test` w `package.json`).

**Stan wykonania §5.1 w repo (iteracje 2026-04, nie zamyka calego Etapu 1):** wspolny `proxyComputeSize` + `resolveProxyMaxForPreviewBuffer`; panel/DIAG: nominal, bufor wejscia, „Interaction (engine)”, „Adjusting (engine)”, „E2E (pan)” (`e2eIsPanning` / `e2ePanning` w `renderDebugInfo`), „E2E (aux)” (sesja rękojeści cadru, `getFilmLabE2ePointerAuxSession`), **„E2E (kbd)”** (`getFilmLabE2eKeyboardSession` — po `markFilmLabE2eKeyboardE2eIntent` do pierwszej prezentacji klatki), wiersz „Profil · LUT podgląd” (`isEnvEnablePreviewLuts`); eksport DIAG: m.in. `workbenchInteractionKind` / `workbenchIsAdjusting` oraz `engineInteractionKind` / `engineIsAdjusting`, `parityInteractionKind` / `parityIsAdjusting` / `parityWorkbenchEngine`, `e2ePanning`, `e2ePointerAux`, `e2ePointerKeyboard` w `flags.runtime` (migawka przy eksporcie; patrz `useFilmLabExportDebugReport`); `test:deep-audit` czyta `useFilmLabExportDebugReport.js` (parity, E2E w DIAG) oraz statycznie `useFilmLabEngine.js` (m.in. `takePreviewE2ePointerToPresentMs`); opcjonalnie `VITE_FILMLAB_PROXY_MATCH_PREVIEW` i wiersz „match bufora” (`readEnvFlag`); `proxyRenderWorker` — `VITE_FILMLAB_WEBGPU_PROXY` i `VITE_FILMLAB_PROXY_OUTPUT_TILES` też `readEnvFlag` (spójność z wątkiem głównym), CPU w workerze: przy wielu kafelkach pełny nominal + `proxyWorkerCpuFullNominalParity`, `VITE_FILMLAB_PROXY_CPU_YIELD_EVERY` (panel **„W · CPU yield”**, `proxyCpuYieldEvery` w DIAG); skrypty m.in. `npm run dev:match-proxy`, `npm run dev:fast-webgl2:match`, `npm run dev:fast-webgl2:match:webgpu`, `npm run dev:fast-webgl2:match:cpu-nominal`, `npm run dev:fast-webgl2:match:cpu-nominal:webgpu`, `npm run dev:match-proxy:webgpu` (WebGPU + match), `dev:cpu-preview-match-nominal`, `dev:proxy-output-tiles` / `dev:proxy-output-tiles:webgpu`, `dev:proxy-cpu-yield`, `dev:proxy-output-tiles:yield` / `…:yield:webgpu`, `build:preview:fast-webgl2:match:cpu-nominal` / `…:webgpu`, `build:preview:proxy-output-tiles` / `…:webgpu`, `build:preview:proxy-cpu-yield`, `build:preview:proxy-output-tiles:yield` / `…:yield:webgpu`; **E2E** — v1 / v2 / v3 w tym `e2eIsPanning`, `aux` kadru, klawiatura, `readPreviewE2ePointerContext`. **Punkt 1 (precyzja):** szybki podgląd w głównym wątku — `FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT` + `fastPreviewMainThreadSourceTexFormat` (`rgba8`, stała importowana w `test:deep-audit`); opcjonalnie `VITE_FILMLAB_FAST_WEBGL2=1` / `npm run dev:fast-webgl2` — kontekst `webgl2` z fallbackiem do `webgl`, pole `fastPreviewGlContext`; przy działającej sondzie FBO: **FBO `RGBA16F` + blit** do canvas (`fastPreviewFloatPipeline: fboRgba16f`), opt-out: `VITE_FILMLAB_FAST_FBO16F=0` (`readEnvNegated` w `runtimeEnv.js`) — jesli brak sondy / WebGL1, `off`. **Upload źródła nadal LDR;** półfloat w calej logice (m.in. pełne 3D LUT tylko w CPU/worker) — otwarte. **Podglądowe LUT profilu:** `isEnvEnablePreviewLuts()` w `runtimeEnv.js` + `filmProfiles` (wyłączenie wyłącznie `VITE_FILMLAB_ENABLE_PREVIEW_LUTS=0`; eksport DIAG: `enablePreviewLuts`). **Atlas LUT/look w szybkim podglądzie:** przy `fboRgba16f` + sondzie 2D upload **RGBA16F** (`fastPreviewLutAtlasTexFormat: rgba16f`), inaczej `rgba8`. **Fragment shader (grading):** przy FBO 16f — `highp` zamiast `mediump` (`fastPreviewGradingPrecision`). **Worker `proxyGpuRenderer` (WebGL2):** gdy sonda FBO + brak `VITE_FILMLAB_FAST_FBO16F=0` — rysowanie do FBO `RGBA16F` + blit (`proxyWorkerWebGlFbo16fBlit` w panelu / DIAG, obok sondy); 3D LUT: `webgl2Rgba16f3dLutProbe` + `proxyWorkerWebGl3dLutRgba16f` (**„W · GL 3D LUT”**). **WebGPU worker** wybiera `rgba16float` vs `rgba8unorm` gdy `probe*` w `proxyWebGpuRenderer` pozwala. **Punkt 4 (WebGPU w watku glownym, §5.1.1.3):** w diag / panelu — `mainThreadWebGpuPreviewStatus`, `mainThreadWebGpuMaxTextureDimension2d`, `mainThreadWebGpuCanvasClearPass`, `mainThreadWebGpuSolidDrawPass`, `mainThreadWebGpuTextureDrawPass`, `mainThreadWebGpuProxyShaderDrawPass`, `mainThreadWebGpuHostSourceProxyPass` (piksele z `sourceCanvas` workbencha po `downscale`, ten sam `fmain`); w workerze `ensureGpuRenderer` / `createProxyWebGpuRenderer`; obraz glowny nadal `createFastPreviewRenderer` (WebGL/WebGL2) + CPU. **Nastepne:** dalsze opt. ścieżki głównego wątku; ewent. hash całej klatki workera (poza 1×1). **W repo (2026-04+):** sonda main — `maxTextureDimension3D`, wiersz **LUT 3D (W · main)**, `webGpuLut3dMainWorkerFormatMatch`; readback piksela (0,0) jako **rb0** w wierszu WebGPU main·preview; w workerze `proxyWorkerWebGpuReadback*`, wiersz panelu **Readback (W · main · rb0)**, w DIAG: `webGpuReadbackMainWorkerRgba3Match` (R,G,B; nie wymusza zgodności — różne ścieżki). `createMainThreadProbe3dLutTextures` — `strip…` tylko przy oversize. Zob. **§5.1.1** (5 zatwierdzonych krokow).

## 6. Ryzyka i Mitygacja

- WebGPU nie dziala wszedzie: wymagany fallback WebGL/WebGL2/CPU, feature detection i telemetry backendow.
- Modele AI moga byc za ciezkie: INT8 quantization, lazy loading, tile processing i graceful degradation.
- RAW parity moze byc wolne lub niezgodne kolorystycznie: referencyjne zestawy RAW, Delta E/SSIM gates i porownania z profilem kamery.
- Katalog moze zwiekszyc zlozonosc danych: jasny model migracji SQLite, sidecary XMP i testy reopen/recovery.
- Prace performance moga rozjechac look: snapshoty renderu i osobny tryb quality gate dla film profiles.

## 7. Appendix MASTER 50 - Skondensowane Mapowanie

To jest jedyny dokument strategiczny dla Film Lab. Nowych wymagan z listy 50 nie dodajemy jako osobnego `MASTER_PLAN_50.md`; trafiaja tutaj albo do konkretnych issue/ticketow.

- Pokryte w repo: stabilizacja workerow, LUT transfer/validation, re-render po LUT, `colorMathShared`, modularizacja Film Lab, persist sesji, undo/redo, eksport JPEG/EXIF, batch ZIP, WebGL/WebGL2 preview fallback, sondy WebGPU w watku glownym (main) i w `proxyRenderWorker` (ten sam `webGpuEnvironment.js`, osobne cache; diagnostyka; worker ma pełny render WebGPU przy flagach dev), limity 2D/3D w proxy i moduły wspolne do downscale/ nominalnego wyjscia (patrz sekcja 3 Etap 1, „Proxy path hardening”), porownanie Przed/Po po kadrowaniu (reset bufora przed `putImageData`), etykieta wersji serwisowej w stosie **Status** na canvasie (dev: czas + git SHA; zob. §2), readback DIAG worker vs main (`Readback (W · main · rb0)`), **worker CPU:** przy wielu kafelkach wyjścia (`PROXY_OUTPUT_TILES`) pełny bufor nominalny + opcjonalny yield wierszy + telemetria/DIAG (parity wymiarów z GPU, nie wielokrotne przejścia jak shader).
- Czesc obecna, ale nie parity: RAW bridge/worker, recovery na obecnym pipeline, histogram/debug/reporting, batch workflow, film preset catalog.
- Roadmap aktywna: WebGPU, `libraw.wasm`, DCP/ICC, Lensfun, soft proofing, lokalne maski, AI denoise/upscale, SQLite OPFS, XMP sidecar, fast culling, smart collections, virtual copies, proof gallery, Smart Consistency Engine, Adaptive Film Emulation i Scientific Film Mode.

## 8. Definition of Done Dla Roadmapy

- Plan nie zawiera aktywnych zadan F0.1-F0.7.
- Auto-save, undo/redo, eksport i batch sa traktowane jako istniejace funkcje, nie jako nowe fundamenty.
- Aktywna roadmapa zaczyna sie od brakow: WebGPU, RAW parity, lokalne maski/AI, katalog PRO i przewagi rynkowe.
- Kazdy etap ma jasny KPI oraz granice wzgledem aktualnego kodu.

## 9. Najblizszy Sprint (bez dublowania prac)

Cel sprintu: domknac najwieksza luke wobec LR/C1 w obszarze **interaktywnosci i przewidywalnosci podgladu** bez przepisywania juz stabilnych warstw.

### 9.1 Czego nie ruszamy (bo juz jest)

- Nie robimy ponownie stabilizacji workerow, transferow, schedulerow, undo/redo, auto-save, eksportu, batch i katalogu presetow (patrz §2 i §2.1).
- Nie przebudowujemy od nowa telemetry/DIAG, tylko dopinamy brakujace metryki i interpretacje.
- Nie ruszamy starych zadan F0 ani duplikatow "quick wins", ktore sa juz zamkniete.

### 9.2 Zakres "must ship" na teraz (Etap 1)

1. **Main preview WebGPU path (A/B do obecnego WebGL):**
   - cel: uruchomienie realnej sciezki kolorystycznej WebGPU dla glownego podgladu, nie tylko sonda;
   - fallback chain bez zmian: WebGPU -> WebGL2/WebGL -> CPU.
2. **Precyzja i parity (koniec "polowicznego 16f"):**
   - doprowadzic krytyczne odcinki do spojnego trybu wyzszej precyzji, z czytelnym stanem OFF/ON w panelu i DIAG;
   - utrzymac zgodnosc looku miedzy worker/main na poziomie akceptowalnym produkcyjnie.
3. **E2E latency contract (jedna prawda o opoznieniu):**
   - metryka od intencji usera do klatki na canvasie, rozdzielona per sciezka (`previewE2ePath`);
   - alert progowy pod KPI (16 ms median na docelowym backendzie).

### 9.3 Definition of Done dla tego sprintu

- Jest feature flag dla glownego podgladu WebGPU i da sie wykonac porownanie A/B z obecnym torem.
- `npm run test:deep-audit`, `npm run test:proxy`, `npm run test:e2e-pointer` przechodza bez regresji.
- Render Debug + DIAG pokazuja:
  - backend finalny klatki,
  - metryke E2E dla aktywnej sciezki,
  - status precyzji i readback parity (W vs main) bez niejednoznacznych opisow.
- Zero duplikacji funkcji juz wdrozonych w §2 (review checklist przy PR).

### 9.4 Backlog po sprincie (kolejny poziom)

- Etap 2: `libraw.wasm` + DCP/ICC + recovery na danych RAW.
- Etap 3: maski lokalne i AI lokalne (subject/sky, denoise ONNX/WebGPU).
- Etap 4: katalog SQLite OPFS + XMP + culling/session workflow.

### 9.5 Plan wykonawczy (2 tygodnie)

#### Tydzien 1

- **A/B main preview WebGPU:** feature flag + wlacznik diagnostyczny, minimalny tor kolorystyczny, twardy fallback do WebGL przy bledzie.
- **Parity narzedziowe:** jeden format raportu A/B (zrzut DIAG + metryki E2E + readback W/main) dla kazdego testu recznego.
- **Kontrola regresji:** codzienny smoke `test:proxy` + `test:e2e-pointer`; pelny `test` przed merge.

#### Tydzien 2

- **Precyzja:** domkniecie krytycznych odcinkow 16f, gdzie dzis jest jeszcze mieszany stan.
- **Latency contract:** finalny pomiar E2E po sciezkach + progi ostrzegawcze pod KPI.
- **Hardening:** poprawki stabilnosci po testach A/B na realnych plikach (duze RAW + drag-heavy scenariusze).

### 9.6 Checklist PR (anty-dublowanie)

Kazdy PR z Etapu 1 powinien zawierac krotkie "TAK/NIE":

1. Czy zmiana dubluje cos z §2 lub §2.1?
2. Czy jest fallback chain WebGPU -> WebGL -> CPU bez regresji UX?
3. Czy DIAG/Render Debug pokazuje nowy stan jednoznacznie?
4. Czy przeszly: `npm run test:deep-audit`, `npm run test:proxy`, `npm run test:e2e-pointer`?
5. Czy opisano ryzyko look-parity (worker vs main) i sposob weryfikacji?

### 9.7 Mini-taski per modul (start implementacji)

#### A. Main preview WebGPU (A/B)

- **`src/filmLab/filmLabMainThreadWebGpuPreview.js`**
  - domknac tor "real preview pass", nie tylko probe status;
  - dopisac jawny status przy fallbacku i powod degradacji.
- **`src/engine/useFilmLabEngine.js`**
  - spiac wybor backendu z feature flaga A/B;
  - utrzymac dotychczasowy fallback chain bez zmiany UX.
- **`src/FilmLabRenderDebugPanel.jsx`**
  - dopisac czytelny wiersz "A/B active backend" i wynik decyzji runtime.

#### B. Precyzja 16f i parity

- **`src/engine/preview/fastPreviewRenderer.js`**
  - zweryfikowac krytyczne miejsca mieszanej precyzji i oznaczyc je telemetrycznie.
- **`src/engine/workers/proxyGpuRenderer.js`**
  - utrzymac spojny stan 16f vs 8-bit po stronie workera WebGL2;
  - jawnie raportowac OFF/ON precyzji do debug info.
- **`src/engine/workers/proxyWebGpuRenderer.js`**
  - potwierdzic parity readback i formatu tekstur przy wlaczonym WebGPU.

#### C. E2E latency contract

- **`src/engine/useFilmLabEngine.js`**
  - finalne metryki E2E per `previewE2ePath` (jedna prawda o opoznieniu).
- **`src/filmLab/useFilmLabExportDebugReport.js`**
  - wyniesc metryki E2E i backend finalny do jednego bloku DIAG.
- **`src/FilmLabRenderDebugPanel.jsx`**
  - pokazac metryki E2E bez dublowania istniejacych etykiet.

#### D. Testy i zabezpieczenia

- **`scripts/test-proxy-webgpu-wiring.mjs`**
  - asercje pod nowe flagi A/B backendu i stan precyzji.
- **`scripts/test-fast-preview-webgl2-wiring.mjs`**
  - asercje dla panelu/DIAG po zmianach A/B i E2E.
- **`scripts/deep-audit-film-lab.mjs`**
  - sprawdzenie obecnosci nowych pol telemetrycznych i parity.

#### E. Kryteria "done" dla kazdego mini-tasku

- kod + telemetry + panel/DIAG zrobione razem (bez "dodamy pozniej");
- fallback chain i UX bez regresji;
- testy z §9.6 (pkt 4) przechodza przed merge.

### 9.8 Kolejnosc realizacji 1 -> N (zaleznosci)

1. **A1 (`filmLabMainThreadWebGpuPreview.js`)**  
   Najpierw stabilny tor WebGPU main + jawne statusy fallbacku.
2. **A2 (`useFilmLabEngine.js`)**  
   Potem przepiecie wyboru backendu pod A/B feature flag (korzysta z A1).
3. **A3 (`FilmLabRenderDebugPanel.jsx`)**  
   UI i czytelna widocznosc decyzji runtime (korzysta z A1+A2).
4. **B1 (`fastPreviewRenderer.js`)**  
   Audyt i domkniecie precyzji po stronie glownego podgladu.
5. **B2 (`proxyGpuRenderer.js`) + B3 (`proxyWebGpuRenderer.js`)**  
   Spojnosc worker/main dla 16f i parity readback.
6. **C1 (`useFilmLabEngine.js`)**  
   Kontrakt E2E i metryki per `previewE2ePath` (na koncu zmian backendowych).
7. **C2 (`useFilmLabExportDebugReport.js`) + C3 (`FilmLabRenderDebugPanel.jsx`)**  
   Jednolite raportowanie DIAG + UI pod finalny model metryk.
8. **D (`scripts/*.mjs`)**  
   Testy wiring/audit dopiero po ustabilizowaniu symboli i nazw pol.

#### Bramka przed merge kazdego kroku

- brak duplikacji funkcji z §2/§2.1;
- brak regresji fallback chain;
- przechodza minimum: `npm run test:proxy` oraz testy dotknietego obszaru;
- przed finalnym merge sprintu: pelny zestaw z §9.6.

### 9.9 PR template (copy/paste)

Uzywac dla kazdego PR w Etapie 1, aby nie wracac do zrobionych rzeczy i utrzymac porownywalnosc review.

```md
## Scope
- [ ] A1 Main preview WebGPU
- [ ] A2 Backend A/B wiring
- [ ] A3 Render Debug visibility
- [ ] B1 Precision in fast preview
- [ ] B2 Worker WebGL2 precision/parity
- [ ] B3 Worker WebGPU parity/readback
- [ ] C1 E2E contract in engine
- [ ] C2 DIAG export alignment
- [ ] C3 Panel E2E alignment
- [ ] D Test wiring/audit update

## No-Duplicate Check (§2 / §2.1)
- [ ] Zmiana NIE dubluje stabilizacji workerow / transferow / undo-redo / auto-save / export / batch
- [ ] Zmiana NIE reimplementuje istniejacej telemetrii bez powodu

## Fallback Chain
- [ ] WebGPU -> WebGL2/WebGL -> CPU dziala bez regresji UX
- [ ] Powod fallbacku jest czytelny w debug info / DIAG

## Telemetry & DIAG
- [ ] Widac backend finalny klatki
- [ ] Widac metryke E2E dla aktywnej sciezki (`previewE2ePath`)
- [ ] Widac status precyzji i parity (W vs main)

## Tests
- [ ] `npm run test:proxy`
- [ ] `npm run test:deep-audit`
- [ ] `npm run test:e2e-pointer`
- [ ] Dodatkowe testy obszaru:
  - [ ] `npm run test:proxy-webgpu`
  - [ ] `npm run test:fast-preview-webgl2`
  - [ ] `npm run test:regression`

## Risk Notes
- [ ] Opis ryzyka look-parity (worker vs main)
- [ ] Plan rollback / feature flag fallback
```

### 9.10 Anti-rework matrix (szybki filtr "czy to juz mamy?")

Uzywac przed rozpoczeciem tasku technicznego:

| Jesli pomysl brzmi... | To najpierw sprawdz... | Decyzja |
|-----------------------|-------------------------|---------|
| "zrobmy od nowa worker scheduler / transfer klatek" | §2 + §2.1 (`proxyRenderWorker`, transfer bitmap/pixels) | **NIE** - to juz jest, tylko hardening/regresje |
| "dodajmy debug WebGPU" | `FilmLabRenderDebugPanel`, `useFilmLabExportDebugReport`, `webGpuEnvironment` | **NIE** - dopinamy brakujace pola, nie nowy panel |
| "zrobmy parity worker vs main" | readback `rb0`, `webGpuReadbackMainWorkerRgba3Match` | **NIE** - parity istnieje, rozwijamy interpretacje/metryki |
| "zrobmy 16f support" | `fastPreviewRenderer`, `proxyGpuRenderer`, `proxyWebGpuRenderer` | **CZESCIOWO** - domykamy lancuch, nie zaczynamy od zera |
| "zrobmy RAW pipeline nowy" | `rawPipelineController`, `rawDecode.worker` | **TAK, ale** jako Etap 2 (`libraw.wasm`) nad bridge, nie obok |
| "zrobmy katalog i XMP" | brak SQLite/OPFS/XMP w silniku | **TAK** - to nadal otwarte (Etap 4) |

Regula: jesli wynik to **NIE**, task musi byc opisany jako rozszerzenie / hardening istniejacej warstwy, nie jako nowy fundament.

### 9.11 Zrealizowane w tej iteracji (2026-04-26, etap wykonawczy)

Domkniete elementy z A/B + E2E observability (bez dublowania §2):

1. **Main preview WebGPU A/B (realny tor, nie tylko sonda):**
   - flaga `VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB`,
   - runtime decyzja i fallback (`armed_probe_ok`, `armed_runtime_fallback`, itp.),
   - realny render przez `fmain` do canvasa na wątku głównym przy aktywnym A/B.
2. **Rozszerzona telemetria A/B (panel + DIAG):**
   - `mainThreadWebGpuPreviewAbEnabled`, `...Decision`, `...Path`, `...RenderMs`, `...SourceTexFormat`,
   - liczniki rolloutu klatek: `...FramesTotal`, `...FramesWebGpuMain`, `...FramesWebGlFallback`, `...WebGpuRatio`,
   - skrót eksportowy DIAG: `mainThreadWebGpuPreviewAbRolloutSummary` (procent + liczniki + fallback),
   - status zdrowia rolloutu: `mainThreadWebGpuPreviewAbHealth` (`ok`/`warn`/`insufficient-data`) na bazie fallback-rate,
   - skrót tekstowy health do szybkiego skanu logów/DIAG: `mainThreadWebGpuPreviewAbHealthSummary` (np. `OK fb 3.1% n=160`, `WARMUP n=6`),
   - wskaźnik gotowości rolloutu dla automatyzacji decyzji: `mainThreadWebGpuPreviewAbRolloutReady` (`true` gdy `health=ok` i `n>=60`),
   - skrót bramki rolloutu do szybkiego skanu DIAG: `mainThreadWebGpuPreviewAbRolloutGateSummary` (np. `READY n=84`, `HOLD n=27`),
   - snapshot progów rolloutu w DIAG: `mainThreadWebGpuPreviewAbThresholds` (`healthWarmupFrames`, `healthWarnFallbackRate`, `gateReadyMinFrames`),
   - skrót opisowy progów w DIAG: `mainThreadWebGpuPreviewAbThresholdsHint` (human-readable, ten sam prefiks `Thresholds: ...` co w tooltipie),
   - współdzielony moduł rollout (`src/filmLab/rolloutGate.js`) utrzymuje jeden format health (`OK/WARN/WARMUP`, `fb`, `n`) i gate (`READY/HOLD n=...`) dla badge/panel/DIAG, parser gate dla tooltipa overlay oraz wspólne opisy progów używane w tooltipach panelu,
   - runtime ma jedno źródło prawdy dla health (`mainThreadWebGpuPreviewAbHealthState`, `mainThreadWebGpuPreviewAbFallbackRate`, `mainThreadWebGpuPreviewAbHealthFrames`), z którego korzysta badge/panel/DIAG,
   - status runtime rozróżnia tor main A/B vs proxy (`Main WebGPU (A/B)` / `Main WebGL (A/B fallback)`),
   - eksport DIAG (korzeń JSON): `schema` (`mindfullens.render-debug.v3`), `generatedAt` (ISO 8601) — wersja kontraktu pliku i czas eksportu,
   - eksport DIAG (`app`): `route` (pełny `location.href` w chwili eksportu), `mode` (`import.meta.env.MODE` + heurystyki `development` / `production` / `preview-like` / `unknown`), `viteBaseUrl` (`import.meta.env.BASE_URL` — `base` Vite, m.in. GitHub Pages vs root), `serviceBuildLabel`, `serviceBuildTag`, `viewportBuildMarker` (`buildInfo.js`), `runtimeStatusBadge`, `previewPathLabel`, `locationOrigin` — URL sesji + tryb bundla + publiczny `base` + wersja + marker plan↔repo + badge + tor preview + host w chwili **DIAG JSON** (baseline §9.12),
   - eksport DIAG (`environment`): `hardwareConcurrency`, `deviceMemoryGb` (gdy przeglądarka podaje), `screen`, `viewport` (`innerWidth` / `innerHeight` / `devicePixelRatio` w chwili eksportu), czas i widoczność karty, `onLine`, `isSecureContext`, `crossOriginIsolated`, `webdriver`, opcjonalnie `jsHeap` (`performance.memory` w Chromium), `prefersColorScheme`, `prefersReducedMotion`, `maxTouchPoints`, `colorGamut`, `pointerCoarse`, `hoverNone`, opcjonalnie `userAgentData`, `networkConnection`, `navigationType`, `webgpu` (main · API/adapter/device), `webgpuWorker` (sonda workera proxy), `sharedArrayBuffer` (migawka hosta / COOP+COEP) — odcisk hosta, klienta, layoutu okna, GPU, workera, SAB i sesji przy porównaniu plików baseline,
   - eksport DIAG `flags.env.devWatchPoll` — czy bundel dev powstał z `VITE_FILMLAB_DEV_WATCH_POLL` (`npm run dev:*:poll`, zewnętrzny dysk / HMR),
   - eksport DIAG `flags.env.mainPreviewWebGpuAb` — czy bundel zawierał `VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB` (A/B głównego podglądu WebGPU vs WebGL; skróty `dev:webgpu:main-ab` / `build:preview:webgpu:main-ab`),
   - eksport DIAG `flags.env.proxyGpu`, `flags.env.webgpuProxy` — `VITE_FILMLAB_PROXY_GPU` / `VITE_FILMLAB_WEBGPU_PROXY` (typowa sesja baseline A/B ustawia oba; por. `package.json` przy `dev:webgpu:main-ab`),
   - eksport DIAG `flags.env.batchPerf`, `flags.env.fastWebgl2`, `flags.env.proxyMatchPreview` — `VITE_FILMLAB_BATCH_PERF`, `VITE_FILMLAB_FAST_WEBGL2`, `VITE_FILMLAB_PROXY_MATCH_PREVIEW` (ZIP perf / szybki WebGL2 / worker dopasowany do bufora preview — por. `docs/README.md`, `package.json`),
   - eksport DIAG `flags.env.debugPanel`, `flags.env.workerDrag`, `flags.env.proxyForceCpuRequested`, `flags.env.fastFbo16fOptOut` (`readEnvNegated` / `VITE_FILMLAB_FAST_FBO16F`), `flags.env.proxyOutputTiles` — panel debug, drag na workerze, żądanie CPU proxy, opt-out FBO 16f, kafle wyjścia proxy; ponadto `flags.env.cpuPreviewMatchNominal` (`VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL`), `flags.env.proxyCpuYieldEvery` (`VITE_FILMLAB_PROXY_CPU_YIELD_EVERY`), `flags.env.e2eHostSchedRaf` (`isEnvE2eHostSchedRaf`), `flags.env.enablePreviewLuts` / `flags.env.enablePreviewLutsViteRaw` (`isEnvEnablePreviewLuts` / `getViteEnablePreviewLutsRaw`), `flags.env.disableCopyProtection` (`VITE_DISABLE_COPY_PROTECTION`) — por. `runtimeEnv.js` / `filmProfiles.js`,
   - eksport DIAG `flags.env.dev` / `flags.env.prod` / `flags.env.ssr` — `import.meta.env.DEV` / `PROD` / `SSR` (w kliencie SPA oczekiwane `ssr: false`; `true` sugeruje bundel pod SSR / nietypowy target),
   - eksport DIAG `flags.effective` — zwięzła migawka `workerDragEnabled`, `proxyGpuEnabled`, `webgpuProxyBuild`, `proxyForceCpuFallback` z `renderDebugInfo` w chwili eksportu (ten sam zestaw jest powtórzony na początku `flags.runtime`, które dalej rozwija pełną telemetrię workera / E2E / A/B); na końcu `flags.runtime`: `rawBackendMode`, `rawBackendPreference`, `rawLinearStageMode`, `rawLinearStageOverride` — tryb i preferencje RAW przy eksporcie,
   - eksport DIAG `flags.showRenderDebugPanel` — stała z `runtimeEnv.js` (czy ten build przewiduje panel Render Debug; nie oznacza, że panel był otwarty w UI),
   - eksport DIAG `performance.batchPerfEnabled`, `performance.lastBatchZip` — `IS_BATCH_PERF_ENABLED` / `getLastBatchPerfSnapshot()` z `batchPerf.js` (czy bundel miał batch-perf oraz ostatnia migawka ZIP w sesji; por. `docs/README.md`, sekcja batch ZIP),
   - eksport DIAG `pipeline`: `label` (`getPipelineLabel(pipelineInfo)` z `pipeline/constants.js`), `info` (pełne `pipelineInfo`), opcjonalnie `rawBackendComparison` gdy był test A/B RAW,
   - eksport DIAG `source`: `fileName`, `fileType`, `fileSize`, `fileLastModified`, `imageMeta`, `exifMeta` — kontekst pliku przy baseline (bez binariów; metadane jak w sesji),
   - eksport DIAG `profile`: `activeFilmIndex`, `activeFilm` (gdy wybrano: `name`, `sub`, `cat`, `sourceId`, `canonicalSourceId`, `internalSourceId`, `isInputProfile`) — który profil filmowy był aktywny przy eksporcie DIAG,
   - eksport DIAG `render`: `isProcessing`, `showInlineProcessing`, `isAdjusting`, `interactionKind`, `previewPathLabel` (jak w `app.previewPathLabel`, zgrupowane przy stanie renderu), `alert` (`renderPipelineAlert`), `fallback` (`code` / `explanation` z workera), `debug` (pełne `renderDebugInfo`), `qualitySignals` (klipy highlight/shadow, black guard, suspected black frame), `qualityQa` (`rawQualityQaSummary`) — migawka UI i diagnostyki w chwili eksportu,
   - eksport DIAG (korzeń JSON): `adjustments`, `userCurves`, `colorMixer`, `colorGrading`, `colorCalibration`, `batchState` — pełny stan edycji i batch w chwili eksportu (przy baseline często porównuje się tylko wybrane fragmenty).
3. **Kontrakt KPI E2E (16 ms median):**
   - mediana ruchoma (okno 31 próbek) per `previewE2ePath`,
   - `previewE2eMedianMs`, `previewE2eKpiTargetMs`, `previewE2eKpiState`,
   - agregacja `previewE2ePerPathStats` + skrót A/B `previewE2eAbSummary` (WebGPU vs WebGL).
4. **UX statusu bez otwierania panelu debug:**
   - `runtimeStatusBadge` pokazuje `A/B Δ...ms (WGPU|WGL)` i `E2E WARN ...` gdy KPI przekroczone,
   - tonalność badge `OK/WARN` + tooltip z opisem KPI,
   - badge pokazuje też rollout A/B na żywo (`rollout ...% (main/total; fb:...)`), status zdrowia (`rollout:OK|WARN|WARMUP`) oraz status decyzyjny (`rollout:READY|HOLD` z `n=...`) w stałej kolejności segmentów (`rollout% -> health -> gate -> A/B Δ -> E2E WARN`); tooltip badge dopina linie `E2E warn: ...`, `A/B delta: ...`, `Rollout health: ...`, `Rollout gate: READY|HOLD (n=...)` oraz `Thresholds: ...`,
   - panel Render Debug ma skrót A/B (`E2E A/B (WebGPU · WebGL)`), runtime counters/ratio (`frames`, `wgpu%`), inline `health: ...` w wierszu `WebGPU (main · preview)` (kolor: zielony `OK`, pomarańczowy `WARN`, neutralny `WARMUP`) oraz osobne wiersze `A/B rollout health` i `A/B rollout gate` (`READY/HOLD`); tooltipy opisują progi health (`WARMUP<10`, `OK<=20%`, `WARN>20%`) i gate (`READY` gdy `OK` + `n>=60`), a nagłówek panelu zawiera legendę `health: OK | WARN | WARMUP`.
5. **Regresje i audit:**
   - zaktualizowane testy wiring/audit (`test-fast-preview-webgl2`, `deep-audit`),
   - przejścia regresji po zmianach.
6. **Workflow uruchamiania A/B (bez ręcznego env):**
   - nowe skróty: `npm run dev:webgpu:main-ab` i `npm run build:preview:webgpu:main-ab`,
   - `.env.example` i `test:env-example-parity` dopięte do nowej flagi `VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB`.

### 9.12 Baseline A/B main preview — runbook i arkusz wyników

**Cel:** powtarzalny protokół pomiaru na bazie telemetrii z §9.11, żeby wypełniać KPI Etapu 1 (latencja, fallback, stabilność) bez zgadywania setupu i bez „ręcznego składania” zmiennych środowiskowych.

#### Warunki wstępne

- Przeglądarka z działającym WebGPU (np. aktualny Chrome lub Edge na macOS/Windows z sterownikiem GPU w dobrej kondycji).
- Znany stan repo: commit lub etykieta **wersji serwisowej** ze stosu **Status** na canvasie (`SERVICE_BUILD_LABEL` / dev timestamp + opcjonalny SHA).
- Domyślny dev pod A/B: `npm run dev:webgpu:main-ab` — ustawia `VITE_FILMLAB_PROXY_GPU=1`, `VITE_FILMLAB_WEBGPU_PROXY=1`, `VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB=1` (por. `package.json`). W Cursor / VS Code: **Tasks** → `Film Lab: dev + WebGPU proxy + main preview A/B + open /film-lab` ([`.vscode/tasks.json`](../.vscode/tasks.json)).
- Opcjonalnie pomiar na zbudowanym bundle: `npm run build:preview:webgpu:main-ab` (bez HMR; bliżej „field” niż dev-server); odpowiedni task: `Film Lab: build + preview (WebGPU proxy + main A/B, baseline)`.
- **Dostęp z sieci LAN** (np. tablet/telefon pod `http://192.168.x.x:4174/film-lab`): Vite musi działać na tej samej maszynie; w `vite.config.js` jest `server.host: true` oraz `allowedHosts: true` (dev + preview), żeby uniknąć 403 dla IP / `*.local`. Zapora na hoście musi przepuszczać **port 4174** — checklista: [docs/README.md](README.md) (punkt o LAN; skrót też w [README.md](../README.md) w sekcji Troubleshooting).
- **Repo na zewnętrznym wolumenie:** gdy HMR nie reaguje na zapis, włącz **`VITE_FILMLAB_DEV_WATCH_POLL=1`** lub skróty **`npm run dev:open:poll`** / **`npm run dev:webgpu:main-ab:poll`** (`.env.example`, `vite.config.js`, *Tasks* w VS Code).

#### Protokół krótkiej sesji (ok. 3–5 minut)

1. Włączyć **Status** na pasku — zweryfikować `runtimeStatusBadge` i tooltip (kolejność segmentów: rollout % → health → gate → A/B Δ → E2E WARN; na dole **Thresholds:**).
2. Otworzyć **Render Debug** — potwierdzić wiersze WebGPU (main · preview), E2E A/B, **A/B rollout health** i **A/B rollout gate**.
3. Załadować reprezentatywny materiał (np. duży JPEG lub RAW w obecnym bridge) i wykonać scenariusz obciążeniowy: **ciągły drag** suwaków (exposure / temp / podobne) oraz **pan** kadru przez 30–60 s, tak aby licznik klatek w rollout osiągnął co najmniej próg gate (domyślnie `n >= 60` — patrz `mainThreadWebGpuPreviewAbThresholds.gateReadyMinFrames` w DIAG i `src/filmLab/rolloutGate.js`).
4. Wyeksportować **DIAG** (JSON) i zapisać plik z datą oraz skrótem identyfikacji maszyny w nazwie (np. `diag-main-ab-2026-04-26-mbp-m3.json`).

#### Minimalny zestaw pól DIAG do porównań między biegami

**Indeks korzenia JSON (kolejność kluczy najwyższego poziomu):** `schema`, `generatedAt`, `app`, `environment`, `flags`, `source`, `pipeline`, `render`, `profile`, następnie pełny stan korekcji `adjustments`, `userCurves`, `colorMixer`, `colorGrading`, `colorCalibration`, `batchState`, `performance`. Ostatnia piątka przed `performance` to zwykle duże obiekty — przydatne do reprodukcji sesji, ale **nie** są częścią „minimalnego” diffu A/B; przy baseline latencji / rolloutu wystarcza lista poniżej.

- `schema`, `generatedAt` — wersja schematu eksportu (`mindfullens.render-debug.v3`) i znacznik czasu w ISO 8601,
- `app.serviceBuildLabel`, `app.serviceBuildTag`, `app.viewportBuildMarker` — wersja z UI + krótki tag `sv-…` + marker synchronizacji plan ↔ repo (`buildInfo.js`),
- `app.mode` — tryb Vite / heurystyka (`development`, `production`, `preview-like` przy porcie 4174 bez `MODE`, `unknown`) — uzupełnia `flags.env.dev` / `prod` przy porównaniu dev vs `preview` vs deploy,
- `app.viteBaseUrl` — `import.meta.env.BASE_URL` (np. `/` vs `/nazwa-repo/` przy *project page*),
- `app.runtimeStatusBadge` — kompaktowy badge runtime w chwili eksportu,
- `app.previewPathLabel` — ten sam tor preview co w panelu/statusie, bez szukania w `render`,
- `app.locationOrigin` — `location.origin` (grupowanie baseline po hoście),
- `app.route` — pełny `location.href` (query, hash) w chwili eksportu — dokładniejszy zapis sesji niż sam origin,
- `environment.hardwareConcurrency`, `environment.deviceMemoryGb` (często tylko Chromium), `environment.screen` — lekki odcisk maszyny przy baseline,
- `environment.viewport` — `innerWidth`, `innerHeight`, `devicePixelRatio` w chwili eksportu (retina, rozmiar okna — kontekst E2E / canvas),
- `environment.timeZone`, `environment.timeZoneOffsetMinutes` — kontekst lokalnej strefy przy porównywaniu sesji,
- `environment.pageVisibilityState`, `environment.pageHidden` — czy karta była w tle w chwili eksportu (istotne dla E2E),
- `environment.onLine` — migawka `navigator.onLine`,
- `environment.isSecureContext`, `environment.crossOriginIsolated` — kontekst bezpieczeństwa / izolacji (SAB, COOP+COEP),
- `environment.webdriver` — wykrycie typowej automatyzacji (baseline ręczny: `false`),
- `environment.jsHeap` — opcjonalnie `performance.memory` (Chromium); pozostałe silniki: `null`,
- `environment.prefersColorScheme` (`dark` / `light` / `no-preference`), `environment.prefersReducedMotion` — `matchMedia` w chwili eksportu,
- `environment.maxTouchPoints`, `environment.colorGamut` (`rec2020` / `p3` / `srgb`), `environment.pointerCoarse`, `environment.hoverNone` — wejście użytkownika i zakres barw wyświetlacza,
- `environment.userAgentData` — gdy dostępne (Chromium): `brands`, `mobile`, `platform` bez high-entropy async,
- `environment.networkConnection` — `navigator.connection` (`effectiveType`, `downlinkMbps`, `rttMs`, `saveData`) albo `null`,
- `environment.navigationType` — `PerformanceNavigationTiming.type` (np. reload vs navigate),
- `flags.env.devWatchPoll` — czy dev był ze `VITE_FILMLAB_DEV_WATCH_POLL` (`dev:*:poll`; zewnętrzny dysk),
- `flags.env.mainPreviewWebGpuAb` — czy build miał `VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB` (sesja A/B main preview),
- `flags.env.proxyGpu`, `flags.env.webgpuProxy` — czy bundel miał worker GPU i proxy WebGPU (`VITE_FILMLAB_PROXY_GPU`, `VITE_FILMLAB_WEBGPU_PROXY`),
- `flags.env.batchPerf`, `flags.env.fastWebgl2`, `flags.env.proxyMatchPreview` — batch perf / fast WebGL2 / proxy „match preview” w bundlu,
- `flags.env.debugPanel`, `flags.env.workerDrag`, `flags.env.proxyForceCpuRequested`, `flags.env.fastFbo16fOptOut`, `flags.env.proxyOutputTiles` — panel / worker drag / force CPU / FBO16f / kafle proxy (gdy porównujesz tory CPU vs GPU),
- `flags.env.cpuPreviewMatchNominal`, `flags.env.proxyCpuYieldEvery`, `flags.env.e2eHostSchedRaf`, `flags.env.enablePreviewLuts`, `flags.env.enablePreviewLutsViteRaw`, `flags.env.disableCopyProtection` — dopasowanie nominalu CPU, yield wierszy, E2E sched→rAF, LUT w podglądzie, surowe env LUT, wyłączenie ochrony kopiowania,
- `flags.env.dev`, `flags.env.prod`, `flags.env.ssr` — `import.meta.env.DEV` / `PROD` / `SSR` (baseline kliencki: `ssr` powinno być `false`),
- `flags.effective.workerDragEnabled`, `flags.effective.proxyGpuEnabled`, `flags.effective.webgpuProxyBuild`, `flags.effective.proxyForceCpuFallback` — skrót toru workera / GPU w chwili eksportu (pełniej: `flags.runtime` + panel),
- `flags.showRenderDebugPanel` — czy build eksponuje panel Render Debug (`runtimeEnv.js`),
- `performance.batchPerfEnabled`, `performance.lastBatchZip` — batch ZIP perf w bundlu + ostatnia migawka (często `null` bez eksportu ZIP w sesji),
- `pipeline.label` — skrót toru pipeline w chwili eksportu (`getPipelineLabel`); pełniejszy kontekst: `pipeline.info` (pełne `pipelineInfo`, może być obszerny),
- `pipeline.rawBackendComparison` — gdy uruchomiono A/B backendu RAW: `winner`, `scoreDelta`, `primary` / `alternate`, ewent. `diffHeatmap`; inaczej `null`,
- `source.fileName`, `source.fileSize`, `source.fileType`, `source.fileLastModified` — identyfikacja materiału i wersji pliku (timestamp); opcjonalnie `source.imageMeta`, `source.exifMeta` przy porównaniu pipeline,
- `profile.activeFilmIndex`, `profile.activeFilm` (`name`, `sourceId`, `canonicalSourceId` itd.) — aktywny profil filmowy w chwili eksportu (kontekst grading),
- `render.interactionKind`, `render.isAdjusting`, `render.isProcessing`, `render.showInlineProcessing` — stan workbencha przy eksporcie (por. parity w `flags.runtime`),
- `render.previewPathLabel` — to samo co `app.previewPathLabel`, zduplikowane w `render` dla czytelności przy analizie bloku UI,
- `render.alert` — `renderPipelineAlert` jeśli był,
- `render.fallback.code`, `render.fallback.explanation` — kod i opis fallback workera (gdy wystąpił),
- `render.qualitySignals` — `highlightClipRatio`, `shadowClipRatio`, `blackOutputGuardTriggered`, `suspectedBlackFrame` (migawka z ostatniej klatki / pipeline),
- `render.qualityQa` — skrót QA RAW (`rawQualityQaSummary`) gdy dostępny,
- `render.debug` — pełne `renderDebugInfo` (zgrupowanie większości telemetrii panelu; przy diff baseline wybieraj klucze, nie cały blob),
- `flags.runtime.rawBackendMode`, `flags.runtime.rawBackendPreference`, `flags.runtime.rawLinearStageMode`, `flags.runtime.rawLinearStageOverride` — RAW przy eksporcie (reszta telemetrii w tym samym `flags.runtime`),
- `batchState` — stan batch w korzeniu raportu (gdy workflow batch aktywny),
- `mainThreadWebGpuPreviewAbEnabled`, `mainThreadWebGpuPreviewAbDecision`, `mainThreadWebGpuPreviewAbPath`, `mainThreadWebGpuPreviewAbRolloutSummary`,
- `mainThreadWebGpuPreviewAbHealth` / `mainThreadWebGpuPreviewAbHealthSummary`, `mainThreadWebGpuPreviewAbRolloutReady`, `mainThreadWebGpuPreviewAbRolloutGateSummary`,
- `mainThreadWebGpuPreviewAbThresholds`, `mainThreadWebGpuPreviewAbThresholdsHint`,
- `previewE2eMedianMs`, `previewE2eKpiTargetMs`, `previewE2eKpiState`, `previewE2eAbSummary`, `previewE2ePerPathStats` (gdy potrzebny rozkład),
- `environment.webgpu` (main — API / adapter / device), `environment.webgpuWorker` (worker proxy — ta sama warstwa co **W** w panelu), `environment.sharedArrayBuffer` (telemetria SAB / izolacji na hoście),
- ewentualnie readback parity (`webGpuReadbackMainWorkerRgba3Match` itd.) przy testach regresji jakości, nie czystej latencji.

#### Interpretacja (skrót)

- **Gate `READY`:** `mainThreadWebGpuPreviewAbRolloutReady === true` oznacza spójny sygnał „zdrowy rollout + wystarczająco próbek”; `HOLD` — kontynuować scenariusz albo zbadać fallback (health `WARN`, małe `n`, środowisko GPU).
- **E2E:** porównać mediany per path z celem; ostrzeżenie w badge (`E2E WARN`) i `previewE2eKpiState` w DIAG = twardy sygnał przekroczenia KPI z §3.
- **Stabilność:** brak „lawiny” przejść na WebGL w typowym dragu przy zdrowym środowisku; wysoki `fallbackRate` przy niskim `n` traktować jako warmup / noise, nie jako werdykt końcowy.

#### Arkusz wyników (wypełniać po uruchomieniu)

| Data | Host / OS | GPU | Build / commit | Tryb | n (rollout) | Health | Gate | fb % | E2E WGPU med (ms) | E2E WGL med (ms) | A/B Δ (z badge) | Uwagi |
|------|-----------|-----|----------------|------|-------------|--------|------|------|-------------------|------------------|-----------------|-------|
| *— wpisać po pierwszym baseline —* | | | | `dev:webgpu:main-ab` | | | | | | | | |

Dodatkowe wiersze warto dodawać dla odrębnych scenariuszy (np. cold start, `build:preview:webgpu:main-ab`, plik 50 MP + kafle proxy, druga przeglądarka lub GPU).

---

To zamyka bieżący blok C1/C2/C3 dla observability, dokumentuje **baseline runbook** pod realne pomiary A/B i przygotowuje grunt pod kolejne prace wydajnościowe / precision bez zgadywania, który tor faktycznie działa w runtime.

