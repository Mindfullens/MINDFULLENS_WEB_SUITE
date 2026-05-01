/// <reference types="vite/client" />

/**
 * Zmienne `VITE_*` używane w aplikacji — szablon i opisy: `../.env.example`.
 * Uzupełniaj przy dodawaniu nowych flag do Vite (i ten plik, i `.env.example`).
 */
interface ImportMetaEnv {
  /**
   * Build (GHP *project page*): publiczne `base` w Vite; zob. `normalizeViteBase`, `build:gh-pages`.
   * W skompilowanej aplikacji używaj `import.meta.env.BASE_URL`, nie wszędzie potrzebne w składzie `src/`.
   */
  readonly VITE_BASE?: string;
  /** Gdy włączone (1 / true / on / yes) — w buildzie prod. wyłącza anti-copy guard (dev i tak). */
  readonly VITE_DISABLE_COPY_PROTECTION?: string;
  readonly VITE_FILMLAB_BATCH_PERF?: string;
  readonly VITE_FILMLAB_DEBUG_PANEL?: string;
  /** Opcjonalny URL modelu ONNX dla maski AI (lazy ort — bez URL ścieżka assist bez zmian). */
  readonly VITE_FILMLAB_ONNX_MODEL_URL?: string;
  /**
   * ONNX: symboliczny rozmiar przestrzenny H=W przy nieznanych wymiarach wejścia (domyślnie w kodzie 256).
   * Zakres sensowny 16–4096 (parsowane jako liczba całkowita).
   */
  readonly VITE_FILMLAB_ONNX_DYNAMIC_SPATIAL?: string;
  /** Opcjonalny URL modelu ONNX dla mapy głębi (maska depth — osobny od AI Subject/Sky). */
  readonly VITE_FILMLAB_DEPTH_ONNX_MODEL_URL?: string;
  /**
   * Domyślnie inferencja depth ONNX używa Web Workera (gdy `Worker` jest dostępny).
   * Ustaw `0` / `false` / `off` / `no`, żeby wymusić WASM na głównym wątku bez próby workera.
   */
  readonly VITE_FILMLAB_DEPTH_ONNX_USE_WORKER?: string;
  /** Gdy `1` — cała ścieżka ONNX depth na głównym wątku (debug / diag); pomija worker mimo dostępności API. */
  readonly VITE_FILMLAB_DEPTH_ONNX_MAIN_THREAD_ONLY?: string;
  /** Gdy `1` — inferencja „depth ONNX” materializuje luminancję (test toru bez modelu). */
  readonly VITE_FILMLAB_DEPTH_ONNX_USE_LUMA_FALLBACK?: string;
  /**
   * Dłuższa krawędź wejścia do modelu głębi (letterbox) — 32–4096, domyślnie 768.
   * Zmniejsz na słabszych urządzeniach.
   */
  readonly VITE_FILMLAB_DEPTH_ONNX_MAX_SIDE?: string;
  /** Gdy `1` — wejście RGB normalizowane jak ImageNet przed ONNX (typowe dla MiDaS). */
  readonly VITE_FILMLAB_DEPTH_ONNX_IMAGENET_NORM?: string;
  /**
   * Wymuszenie layoutu tensora wejścia, gdy metadane są dwuznaczne: `nchw` | `nhwc`.
   * Puste = heurystyka (kanał `3` na poz. 1 vs 3, inaczej domyślnie NCHW).
   */
  readonly VITE_FILMLAB_DEPTH_ONNX_INPUT_LAYOUT?: string;
  /** Nazwa tensora wyjścia ONNX (depth); priorytet nad OUTPUT_INDEX. */
  readonly VITE_FILMLAB_DEPTH_ONNX_OUTPUT_NAME?: string;
  /** Indeks wyjścia (0..n) wg `session.outputNames`; gdy brak OUTPUT_NAME. */
  readonly VITE_FILMLAB_DEPTH_ONNX_OUTPUT_INDEX?: string;
  /** Wielokanałowe wyjście głębi: `first` | `mean`. */
  readonly VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS?: string;
  /** Timeout `requestIdleCallback` dla startu inferencji depth ONNX (ms; domyślnie 480). */
  readonly VITE_FILMLAB_DEPTH_ONNX_IDLE_TIMEOUT_MS?: string;
  /**
   * Gdy `1` — `server.watch.usePolling` w `vite.config.js` (dev). Pomaga na zewnętrznych / sieciowych wolumenach, gdzie brak HMR.
   */
  readonly VITE_FILMLAB_DEV_WATCH_POLL?: string;
  /**
   * Gdy `1` — w `useFilmLabEngine` pomiar czasu od ostatniego `scheduleProgressiveRender` do pierwszego host `requestAnimationFrame` (wątek główny), który wykonuje pracę podglądu; pole `previewE2eHostSchedToRafMs` w panelu / DIAG. Domyślnie wył.
   */
  readonly VITE_FILMLAB_E2E_HOST_SCHED_RAF?: string;
  readonly VITE_FILMLAB_WORKER_DRAG?: string;
  readonly VITE_FILMLAB_PROXY_GPU?: string;
  readonly VITE_FILMLAB_PROXY_FORCE_CPU?: string;
  /** Gdy `1` — pełna rozdzielczość proxy w wielu kafelkach 2D (worker GPU) zamiast jednego docięcia do maxTexture. */
  readonly VITE_FILMLAB_PROXY_OUTPUT_TILES?: string;
  /**
   * Worker: co ile wierszy pętli CPU proxy wywołać `setTimeout(0)` (odstęp od blokady wątku). Pusty / `0` = wył.
   * Np. `64` — rzadsze, większe obrazy. Tylko `renderProxyFrame` (CPU).
   */
  readonly VITE_FILMLAB_PROXY_CPU_YIELD_EVERY?: string;
  /**
   * Gdy `1` — `proxyMax` w workerze min. tyle co dłuższa krawędź bufora preview (wspólna rozdzielczość z CPU; droższy drag).
   */
  readonly VITE_FILMLAB_PROXY_MATCH_PREVIEW?: string;
  /**
   * Gdy `1` — CPU `quality=preview`: downscale 2D do nominalnego rozmiaru (`getNominalProxyRenderSize`) przed pętlą pikseli, jak worker. Domyślnie wył.
   */
  readonly VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL?: string;
  /**
   * Worker proxy: ścieżka WebGPU (parallel do WebGL2), Etap 1 planu v3.1. `1` włącza; wymaga `getOrCreatePersistentWebGpuDevice` w workerze.
   */
  readonly VITE_FILMLAB_WEBGPU_PROXY?: string;
  /**
   * A/B Etap 1: próba głównego podglądu WebGPU w wątku głównym (`filmLabMainThreadWebGpuPreview`); domyślnie wył., włączane jawnie (`1`).
   */
  readonly VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB?: string;
  /**
   * Domyślnie włączone; jedyna reguła wyłączenia: wartość `0` po trim — `isEnvEnablePreviewLuts()` w `runtimeEnv.js` (łącznie z `filmProfiles`).
   */
  readonly VITE_FILMLAB_ENABLE_PREVIEW_LUTS?: string;
  /**
   * Gdy `1` — szybki podgląd próbuje `getContext('webgl2')` (te same shadery co WebGL1); przy błędzie — WebGL1.
   */
  readonly VITE_FILMLAB_FAST_WEBGL2?: string;
  /**
   * Gdy `0` / `off` / `no` — wyłącza FBO `RGBA16F`+blit w szybkim podglądzie (WebGL2 + FBO sonda).
   * Domyślnie: przy działającym WebGL2+sondzie półprecyzyjna ścieżka jest włączona.
   */
  readonly VITE_FILMLAB_FAST_FBO16F?: string;
  /**
   * Worker RAW (`rawDecode.worker.js`): wybór adaptera dekodowania. `http-bridge` (domyślnie) = fetch do `__raw/decode`;
   * `libraw-wasm` = LibRaw WASM (`libraw-wasm`, `rawDecodeLibrawWasm.js`; domyślnie wył. — duży bundle).
   */
  readonly VITE_FILMLAB_RAW_DECODE_ADAPTER?: string;
  /** Worker RAW: prosty recovery 2D po dekodzie (kompresja świateł + podniesienie cieni). */
  readonly VITE_FILMLAB_RAW_RECOVERY_2D?: string;
  /** Siła kompresji świateł dla recovery 2D (0..1), domyślnie 0.35. */
  readonly VITE_FILMLAB_RAW_RECOVERY_HIGHLIGHT_STRENGTH?: string;
  /** Siła podnoszenia cieni dla recovery 2D (0..1), domyślnie 0.25. */
  readonly VITE_FILMLAB_RAW_RECOVERY_SHADOW_STRENGTH?: string;
  /**
   * LibRaw WASM (`rawDecodeLibrawWasm.js`): `use_camera_matrix` (dcraw/LibRaw 0..3). Domyślnie puste → w kodzie **3** (macierz aparatu / linia DCP).
   */
  readonly VITE_FILMLAB_RAW_LIBRAW_USE_CAMERA_MATRIX?: string;
  /**
   * LibRaw WASM: gdy `embed` / `1` / `yes` — `camera_profile: embed` przy `open()` (profil z pliku RAW/DNG, DCP/ICC w kontenerze), gdy build LibRaw ma LCMS.
   */
  readonly VITE_FILMLAB_RAW_LIBRAW_CAMERA_PROFILE?: string;
  /**
   * Ustawiane w `vite.config.js` (`define`) z `git rev-parse --short HEAD`; puste gdy brak gita.
   * Suffix dev w etykiecie wersji serwisowej (stos **Status** na canvasie) tylko gdy `import.meta.env.DEV` (zob. `buildInfo.js`).
   */
  readonly VITE_FILM_LAB_GIT_SHA?: string;
}
