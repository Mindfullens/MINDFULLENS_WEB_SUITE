# Plan Sprintowy 90 dni (17.04.2026 -> 16.07.2026)

## Stan na 2026-04-26

- Aktywny plan strategiczno-wdrożeniowy Film Lab: [`MINDFULLENS_FILM_LAB_PLAN_V3_1.md`](MINDFULLENS_FILM_LAB_PLAN_V3_1.md).
- Sprint 1 poniżej traktuj jako **zamknięty**; szczegóły wykonania: [`SPRINT_1_EXECUTION.md`](SPRINT_1_EXECUTION.md).
- Mapa dokumentacji w `docs/`: [`README.md`](README.md).
- **A/B main preview (WebGPU):** telemetria rollout / health / gate / E2E jest w UI i DIAG; **powtarzalny protokół baseline** (dev/preview, eksport JSON, tabela wyników): v3.1 **§9.12**; skrót npm: `dev:webgpu:main-ab`, `build:preview:webgpu:main-ab`.

## Status planu 90 dni (skrot)

W skrocie, co juz jest w kodzie, a co nadal wymaga osobnej pracy opisanej w v3.1. Ta sekcja ma tylko synchronizowac oczekiwania; szczegoly techniczne trzymaj w v3.1.

| Sprint | Okres | Status | Komentarz |
| --- | --- | --- | --- |
| S1 | 20.04-01.05 | **DONE** | Zamkniete zgodnie z `SPRINT_1_EXECUTION.md` (stabilizacja podgladu, skroty, diagnostyka, regresje). |
| S2 | 04.05-15.05 | **PARTIAL** | Jest sciezka RAW: worker + most `rawDecode.worker.js` + ingest `ingestSource.js` + liniowy etap w metadata (`colorPipeline`). Brakuje `libraw.wasm`, pelnego DCP/ICC i pelnego highlight/shadow recovery w sensie "RAW pipeline parity" (patrz v3.1, Etap 2). |
| S3 | 18.05-29.05 | **NOT STARTED (w tym sensie PRO)** | Sa: undo/historia, batch ZIP, auto-save sesji, "katalog" presetow. Brakuje katalogu SQLite, XMP sidecar, cullingu, smart collections. |
| S4 | 01.06-12.06 | **PARTIAL** | HSL/Color mixer, krzywe per kanal, clipping overlay, output sharpening, histogram podstawowy sa w `useFilmLabEngine.js`. Brak soft proofing ICC, pelnego scope/waveform, pelnych korekcji optyki (Lensfun itd.) vs v3.1. |
| S5 | 15.06-26.06 | **NOT STARTED** | Brak masek edycyjnych brush/linear/radial i AI; patrz v3.1 Etap 3. |
| S6 | 29.06-10.07 | **PARTIAL (tylko czesc exportu)** | Eksport profili social/web + ostrzenie + ZIP batch jest, ale brak "session mode" jak w Capture One, brak proof gallery, brak installera. |

## Założenia

- Start sprintów: poniedziałek, 20 kwietnia 2026.
- Długość sprintu: 2 tygodnie.
- Sprinty:
  - S1: 20.04-01.05
  - S2: 04.05-15.05
  - S3: 18.05-29.05
  - S4: 01.06-12.06
  - S5: 15.06-26.06
  - S6: 29.06-10.07
- Hardening release: 13.07-16.07.

## Pojemność zespołu (realistycznie)

- Zespół 2 osoby: 28-34 SP/sprint.
- Zespół 3 osoby: 42-50 SP/sprint.
- Zespół 4 osoby: 56-66 SP/sprint.

## Priorytet

- P0 krytyczne, bez tego nie ma jakości Lightroom/Capture One.
- P1 ważne, buduje przewagę.
- P2 innowacje i nice-to-have.

### Legenda statusow (dla sekcji Sprint 1-6)

- **DONE**: jest sensowna, konczaca sie implementacja w repo (nawet jesli nie w 100% "wersja koncowa produktu").
- **PARTIAL**: jest rdzen funkcji, ale brakuje warstw z definicji sprintu (np. parity PRO, cale workflow, czy pelna in-browser sciezka).
- **NOT STARTED**: brak odpowiednika w kodzie aplikacji w sensie wymagania sprintu.
- Dla Film Lab, szerszy opis dalszej pracy jest w [`MINDFULLENS_FILM_LAB_PLAN_V3_1.md`](MINDFULLENS_FILM_LAB_PLAN_V3_1.md).

## Sprint 1 (20.04-01.05): Stabilny silnik i diagnostyka

- [P0][8 SP] Uporządkowanie geometrii preview/zoom/pan z testami snapshot.
  - **DONE**: opis i checklista w [`SPRINT_1_EXECUTION.md`](SPRINT_1_EXECUTION.md) (sekcja "Preview geometry hardening").
- [P0][8 SP] Twarde testy regresji renderu dla 30 zdjęć referencyjnych.
  - **DONE**: bramka `npm run test:regression` (skrypt: `scripts/regression-film-lab.mjs` w `package.json` jako `test:regression`) + wykonanie opisane w `SPRINT_1_EXECUTION.md` ("Testowanie i bramka jakosci"). Liczba "30" w tytule backlogu nie jest enforcementem w kodzie; realny zestaw jest tym, co testuje skrypt i bramki.
- [P0][5 SP] System telemetryczny czasu renderu CPU/GPU i fallbacków.
  - **DONE**: `renderDebugInfo` w `src/engine/useFilmLabEngine.js` + UI w `src/FilmLabRenderDebugPanel.jsx` (m.in. `lastRenderPath`, `proxyLastFrameBackend`, `workerRenderMs`).
- [P0][5 SP] Crash guard + raport błędów pipeline.
  - **DONE**: `reportRenderPipelineError` w `src/engine/useFilmLabEngine.js` + eksport raportu w `src/filmLab/useFilmLabExportDebugReport.js` (przycisk "DIAG JSON" w toolbarze, patrz `src/FilmLabToolbar.jsx`).
- [P1][3 SP] Debug overlay w trybie developerskim.
  - **DONE**: panel render debug (`src/FilmLabRenderDebugPanel.jsx`) + flagi w `src/filmLab/runtimeEnv.js` (`SHOW_RENDER_DEBUG_PANEL`, zmienne `VITE_FILMLAB_*`).
- [P1][3 SP] Spójny system skrótów (F, \, J, 0, +, -).
  - **DONE**: opis w `SPRINT_1_EXECUTION.md` (sekcja "Shortcut reliability") + straż regresji skrótów w `scripts/regression-film-lab.mjs` (wspomniane w execution plan).

## Sprint 2 (04.05-15.05): RAW pipeline v1

- [P0][8 SP] Integracja dekodera RAW (CR2/NEF/ARW) + fallback.
  - **PARTIAL**: jest caly szkielet: `src/engine/pipeline/raw/rawDecode.worker.js` + sterowanie `src/engine/pipeline/raw/rawPipelineController.js` + ingest w `src/engine/pipeline/ingestSource.js`. W praktyce sukces zalezy od aktywnego mostka/serwera dekodera (porownaj komunikaty i fallbacki w `ingestSource.js`). In-browser `libraw.wasm` to osobna praca w v3.1.
- [P0][8 SP] Color pipeline linear -> display space.
  - **PARTIAL**: deklarowane i przenoszone metadanymi `colorPipeline` (np. `workingEncoding: scene-linear` w `rawDecode.worker.js`) oraz obslugiwane w silniku w gałezi RAW w `useFilmLabEngine.js` (np. `rawLinearStageEnabled` i etapy liniowe). To nie jest jeszcze "parity" DCP/ICC i pelnego color science jak w v3.1.
- [P0][5 SP] Recover highlights/shadows z danych RAW.
  - **PARTIAL**: w `useFilmLabEngine.js` sa parametry i logika `rawHighlightRecovery` / `rawShadowRecovery` w pipeline RAW, ale to nie zastepuje pełnego modelu highlight/shadow z sensora, ktory wymaga libraw+RAW buffers (v3.1, Etap 2).
- [P0][5 SP] Ujednolicenie metadata/EXIF/orientation.
  - **PARTIAL**: import metadanych: `src/engine/metadata/exifMetadata.js` (parsowanie i transformacje orientacji). Eksport JPEG dokleja EXIF przez `piexifjs` w `useFilmLabEngine.js` i `batchProcessor.js`, ale to nie jest jeszcze "round-trip" calego EXIF wejscia (np. export ustawia `Orientation = 1`).
- [P1][5 SP] Profilowanie jakości demosaikacji (A/B).
  - **DONE (w sense A/B backendow dekodowania)**: w `rawDecode.worker.js` sa A/B, porownania i payload `backendAbTest` + opcjonalnie heatmapa roznic (`diffHeatmap`).
- [P1][3 SP] Alerty jakościowe dla czarnej klatki/przepaleń.
  - **PARTIAL**:
    - "czarna klatka" / diagnostyka dekodu: `rawDecode.worker.js` (logika black frame i diagnostyki) + `src/filmLab/useFilmLabRawQualitySummaries.js`
    - "przepalenia": glownie jako overlay w podgladzie (`showClipping` w `useFilmLabEngine.js`), bez osobnych alertow UI w stylu "highlight clipping warning" dla calej sesji

## Sprint 3 (18.05-29.05): Katalog i workflow podstawowy

- [P0][8 SP] Katalog SQLite + indeksowanie miniatur.
  - **NOT STARTED**: brak `sql.js`/SQLite/OPFS pod katalog zdjec w `src/`. W aplikacji jest "katalog" presetow klatek (`src/filmLab/useFilmLabFilmCatalog.js`), co nie spelnia tego wymagania.
- [P0][8 SP] XMP sidecar read/write.
  - **NOT STARTED**: brak read/write XMP w kodzie (poza copy marketingowym w `src/LandingPage.jsx` / `src/MatcherPage.jsx`). Patrz v3.1 (workflow PRO).
- [P0][5 SP] Historia edycji, snapshoty, virtual copy.
  - **PARTIAL**:
    - undo/redo + snapshoty stanu: `src/filmLab/useFilmLabUndoRedo.js`, `src/filmLab/sessionSnapshot.js`, `src/filmLab/useFilmLabSessionPersistenceBundle.js`
    - virtual copy: **NOT STARTED** w sensie wielu niezaleznych wariantow edycji tego samego pliku w katalogu.
- [P0][5 SP] Batch sync ustawień między zdjęciami.
  - **PARTIAL**: "sync" w praktyce to copy/paste receptury przez schowek lokalny: `src/filmLab/useFilmLabEditClipboard.js` + batch render ZIP w `src/engine/batchProcessor.js` (to nie jest Lightroom-like sync wielu zaznaczonych klipow w katalogu).
- [P1][5 SP] Culling v1 (gwiazdki/flagi/kolory/szybkie skróty).
  - **NOT STARTED**: brak UI/CRUD ratingow i predkosci cullingu; patrz v3.1.
- [P1][3 SP] Smart collections v1.
  - **NOT STARTED**: brak kolekcji opartych o metadane/SQL; patrz v3.1.

## Sprint 4 (01.06-12.06): Narzędzia pro tonal/color

- [P0][8 SP] HSL/Color Mixer klasy pro z dokładniejszym zakresem hue.
  - **PARTIAL**: mamy mixer i mape sliderow, ale to nie jest "Capture One pro hue range" w sensie calego modulu; rdzen jest w `useFilmLabEngine.js` (m.in. sekcje HSL / mixer i szybka sciezka preview).
- [P0][8 SP] Krzywe tonalne per kanał + LUT cache.
  - **PARTIAL / DONE w rdzeniu**: krzywe per kanal + wysokiej rozdzielczosci cache LUT: `useFilmLabEngine.js` (np. `USER_CURVE_LUT_RESOLUTION`, `buildHighResCurveLut`, sampleCurveLut) + `src/engine/curveInterpolation.js`. Nadal otwarty temat: pelna spojnosc/parity z narzedziami PRO spoza Film Lab to v3.1.
- [P0][5 SP] Clipping overlay RGB/Luma z progami.
  - **PARTIAL / DONE w podgladzie (i opcjonalnie w single export)**: `showClipping` + progi w `useFilmLabEngine.js` (glowny render). Grupowy export w `src/engine/batchProcessor.js` nie przeklada tego trybu 1:1, bo to osobna sciezka renderu pod ZIP.
- [P0][5 SP] Lens correction + chromatic aberration.
  - **PARTIAL**: mamy stylizowany chromatic aberration na poziomie looku (`chromAb` w `proxyRenderWorker.js` / `useFilmLabEngine.js`), ale nie ma korekcji optyki obiektywu (Lensfun/LCP) jak w wymaganiu sprintu; patrz v3.1.
- [P1][5 SP] Soft proofing ICC v1.
  - **NOT STARTED**: brak proofingu ICC w `src/` (v3.1).
- [P1][3 SP] Waveform/histogram rozszerzony.
  - **PARTIAL**: histogram w UI (`src/filmLab/useFilmLabPreviewCanvasEffects.js` + `src/filmLab/histogramCanvas.js` + `src/FilmLabCanvasHistogramBar.jsx`). Brak waveform/vectorscope jako real-time scope.

## Sprint 5 (15.06-26.06): Maski lokalne i AI v1

- [P0][8 SP] Maski ręczne: brush, linear, radial.
  - **NOT STARTED** (maski edycji; crop mask to nie to samo co maski lokalnych korekt).
- [P0][8 SP] Maski automatyczne: subject/sky.
  - **NOT STARTED** (brak modeli segmentacji w repo).
- [P0][5 SP] Denoise AI v1 (RGB).
  - **NOT STARTED** (brak ONNX pipeline).
- [P0][5 SP] Lokalna ekspozycja/kolor/texture na maskach.
  - **NOT STARTED** (wymaga systemu masek).
- [P1][5 SP] Match look do zdjęcia referencyjnego.
  - **NOT STARTED** (poza ewentualnymi heurystykami auto-develop, ale nie "match to reference" jako feature).
- [P2][3 SP] Segmentacja skóry jako osobna maska.
  - **NOT STARTED**

## Sprint 6 (29.06-10.07): Session mode i release candidate

- [P0][8 SP] Session mode jak Capture One (capture/selects/output/trash).
  - **NOT STARTED** w sensie dedykowanego modulu sesji (poza pojedynczym workflow edycji w Film Lab).
- [P0][8 SP] Export preset pipeline (social/web/print) + output sharpening.
  - **PARTIAL**:
    - size profile: `exportImage` w `useFilmLabEngine.js` (np. 1080/2048) + `batchProcessor.js`
    - output sharpening: `src/engine/outputSharpening.js` (importowane w export/batch)
- [P0][5 SP] Performance hardening dla dużych sesji.
  - **PARTIAL**: sa optymalizacje (workery, proxy, aborty), ale to nie jest "hardening sesji katalogu" bo katalogu PRO brak. Ocena duzych plikow i tile/pamiec jest w v3.1.
- [P0][5 SP] Installer/update i migracje bazy.
  - **NOT STARTED** (aplikacja webowa; brak installera; brak bazy katalogu).
- [P1][5 SP] Proof gallery v1 dla klienta.
  - **NOT STARTED**
- [P1][3 SP] Preset versioning + rollback.
  - **NOT STARTED** (są wersjonowane snapshoty lokalne v1 w `filmLabSessionPersist.js`, to nie to samo co preset versioning w katalogu).

## Hardening (13.07-16.07)

To jest **okno planowane w czasie** (13.07-16.07), a nie raport wykonania z 2026-04-25. Ponizej: co juz da sie oprzec o repo (gate’y, telemetria), a co nadal jest procesem manualnym.

- [P0] Zero blockerów, tylko bugfix.
  - **STATUS: PLANNED / PROCESS**: same "zero blockerow" jest celem operacyjnym, nie featurem w kodzie.
  - **Co juz jest**: mocne gate’y developerskie w `package.json` (np. `ci:smoke`, `raw:release:check`) oraz regresje `test:regression`, `test:crop-geometry`, `test:deep-audit`, `test:raw-reference`.
- [P0] Test pełnej ścieżki: import -> edycja -> batch -> export -> reopen.
  - **STATUS: PARTIAL (automaty) + PARTIAL (manual)**: brak dedykowanego E2E w Playwright, ale:
    - **Automaty**: `ci:smoke` i `raw:release:check` pokrywaja duza czesc ryzyka regresji (lint + regresje + build + surowe RAW referencyjne gdy odpalane).
    - **Manual / checklista**: `SPRINT_1_EXECUTION.md` zawiera praktyczna liste akceptacyjna pod debug build.
    - **Luka**: brak jednego, powtarzalnego "full user journey" w CI, ktory klikalby UI w przegladarce.
- [P0] Stabilność: minimum 1000 renderów bez crash.
  - **STATUS: TARGET**: nie ma w repo narzedzia, ktore samo w sobie "liczy 1000 renderow" jako gate produkcyjny. Stabilnosc wspieraja: workery, aborty, `reportRenderPipelineError`, regresje, testy raw reference.
- [P0] Freeze funkcji i release notes.
  - **STATUS: PROCESS/DOC** (poza repo lub w procesie wydawniczym) — repo nie "freezuje" funkcji automatycznie.

## Minimalny skład zespołu i role

- 2 osoby: Engine/RAW + Frontend/UX.
- 3 osoby: Engine/RAW + Frontend/UX + Katalog/QA.
- 4 osoby: Engine/RAW + Frontend/UX + Katalog/Workflow + AI/Performance.

## KPI na koniec 90 dni

To sa cele, nie twarde metryki "wdrozone w produkcie" jako dashboard. Tu jest jak je **zmierzyc** w obecnym repo vs co jest tylko celem.

- Preview latency suwaka: < 20 ms median.
  - **Jak mierzyc teraz (czesciowo)**: `workerRenderMs` + `lastRenderPath` w `useFilmLabEngine.js` wyswietlane w `FilmLabRenderDebugPanel.jsx` (to nie jest perfect median, ale daje pomiar w ms w UI).
  - **Mikro-benchmark w CI (inne pokrycie)**: `npm run test:deep-audit` → `scripts/deep-audit-film-lab.mjs` wypisuje m.in. `fuzz.p50Ms/p95Ms/...` dla kosztu `buildFastPreviewAdjustments` (szybka sciezka matematyczna), co jest twardym sygnalem, ale **nie** zastepuje pomiaru renderu 1:1 w UI.
- Czas otwarcia RAW: < 1.5 s.
  - **Jak mierzyc teraz (czesciowo)**: logi czasu w workerze/bridge w `rawDecode.worker.js` + logi w `ingestSource.js` (konsola i payload diagnostyczny) oraz surowe testy `test:raw-reference` (skrypt) jako gate jakosci, nie pomiar produktowy mediany.
- Crash-free sessions: > 99.5%.
  - **Jak mierzyc (na razie)**: to wymaga telemetrii w produkcie (Sentry/GA itd.) albo dedykowanego agregatora. W kodzie mamy miejsca, ktore to ulatwia (kody bledow w `reportRenderPipelineError`), ale sam KPI nie jest jeszcze "podpiety" pod analityke.
- Batch export 100 zdjęć: minimum 30% szybciej niż obecnie.
  - **Jak mierzyc**: wymaga benchmarku A/B w CI lub skryptu (porownanie dwoch commitow / dwoch trybow). W repo jest `batchProcessor.js` i workflow ZIP, ale nie ma jednego, standardowego benchmarku, ktory raportuje "+X%".
- Zgodność renderu na zestawie referencyjnym: >= 95% względem target look.
  - **Jak mierzyc**: juz jest infrastruktura regresji (`test:regression`, `test:raw-reference` + dane w `data/raw/reference`), ale to jest "gate jakosci" i musi miec ustalone progi, zamiast arbitralnej liczby 95% na poziomie tego pliku.
