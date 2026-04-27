import { useCallback, useState } from 'react';
import { getLastBatchPerfSnapshot, IS_BATCH_PERF_ENABLED } from '../engine/batchPerf.js';
import { getPipelineLabel } from '../engine/pipeline/constants.js';
import { getWebGpuApiExposure } from '../engine/webGpuEnvironment.js';
import {
  getProxyWorkerOutputFitStatusLabel,
  getProxyWorkerOutputTileStatusLabel,
  isProxyWorkerGpuInputTexDownscaled,
  isProxyWorkerProxyOutputFitted,
} from './proxyWorkerGpuInputTelemetry.js';
import {
  getFilmLabE2eKeyboardSession,
  getFilmLabE2ePointerAuxSession,
} from './previewE2ePointerMark.js';
import {
  getSharedArrayBufferHostSnapshot,
  getViteEnablePreviewLutsRaw,
  isEnvE2eHostSchedRaf,
  isEnvEnablePreviewLuts,
  readEnvFlag,
  readEnvNegated,
  SHOW_RENDER_DEBUG_PANEL,
} from './runtimeEnv.js';
import {
  MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS,
  getMainPreviewAbRolloutGateInfo,
  getMainPreviewAbRolloutGateThresholdsHint,
  getMainPreviewAbRolloutHealthInfo,
  getMainPreviewAbRolloutHealthThresholdsHint,
  getPreviewE2eFrameCostGateThresholdsHint,
  PREVIEW_E2E_FRAME_COST_GATE_MIN_SAMPLES,
  PREVIEW_E2E_FRAME_COST_TARGET_MS,
} from './rolloutGate.js';
import { SERVICE_BUILD_LABEL, SERVICE_BUILD_TAG, VIEWPORT_BUILD_MARKER } from './buildInfo.js';

export function useFilmLabExportDebugReport({
  activeFilm,
  activeFilmIndex,
  adjustments,
  batchState,
  colorCalibration,
  colorGrading,
  colorMixer,
  exifMeta,
  fallbackExplanation,
  imageMeta,
  interactionKind,
  isAdjusting,
  isProcessing,
  pipelineInfo,
  previewPathLabel,
  renderPipelineAlert,
  renderDebugInfo,
  runtimeStatusBadge,
  rawQualityQaSummary,
  rawBackendMode,
  rawBackendPreference,
  rawLinearStageMode,
  rawLinearStageOverride,
  showInlineProcessing,
  uploadedFile,
  userCurves,
}) {
  const [debugExportFeedback, setDebugExportFeedback] = useState(null);

  const exportDebugReport = useCallback(() => {
    const resolvedAppMode =
      import.meta?.env?.MODE ??
      (import.meta?.env?.DEV ? 'development' : import.meta?.env?.PROD ? 'production' : null) ??
      (typeof window !== 'undefined' && window.location?.port === '4174' ? 'preview-like' : null) ??
      'unknown';
    const fallbackCode = String(renderDebugInfo?.proxyWorkerReason ?? '').trim() || null;
    const mainPreviewAbDecision = String(renderDebugInfo?.mainThreadWebGpuPreviewAbDecision ?? '').trim();
    const mainPreviewAbPath = String(renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? '').trim();
    const mainPreviewAbFallbackCode =
      mainPreviewAbPath === 'webgl-fallback'
        ? mainPreviewAbDecision === 'armed_runtime_error'
          ? 'main-webgpu-runtime-error'
          : mainPreviewAbDecision === 'armed_runtime_fallback'
            ? 'main-webgpu-runtime-fallback'
            : mainPreviewAbDecision === 'armed_probe_fail'
              ? 'main-webgpu-probe-fail'
              : 'main-webgpu-fallback'
        : null;
    const mainPreviewAbFallbackExplanation =
      mainPreviewAbFallbackCode === 'main-webgpu-runtime-error'
        ? 'Main preview WebGPU: błąd runtime, użyto fallbacku WebGL.'
        : mainPreviewAbFallbackCode === 'main-webgpu-runtime-fallback'
          ? 'Main preview WebGPU: ścieżka runtime zwróciła fallback, użyto WebGL.'
          : mainPreviewAbFallbackCode === 'main-webgpu-probe-fail'
            ? 'Main preview WebGPU: sonda nie powiodła się, użyto fallbacku WebGL.'
            : mainPreviewAbFallbackCode === 'main-webgpu-fallback'
              ? 'Main preview WebGPU: aktywny fallback do WebGL.'
              : null;
    const rawAbTest = pipelineInfo?.capabilities?.backendAbTest ?? null;
    const rawAbWinner = String(rawAbTest?.winner ?? '').trim();
    const rawAbPrimaryScore = Number(rawAbTest?.primary?.score);
    const rawAbAlternateScore = Number(rawAbTest?.alternate?.score);
    const rawAbScoreDelta =
      Number.isFinite(rawAbPrimaryScore) && Number.isFinite(rawAbAlternateScore)
        ? rawAbAlternateScore - rawAbPrimaryScore
        : null;
    const rawAbSelectedBackend =
      rawAbWinner === 'alternate'
        ? rawAbTest?.alternate?.backend ?? null
        : rawAbTest?.primary?.backend ?? null;
    const highlightClipRatio = Number(renderDebugInfo?.lastFrameHighlightClipRatio);
    const shadowClipRatio = Number(renderDebugInfo?.lastFrameShadowClipRatio);
    const rawQualitySignals = {
      highlightClipRatio: Number.isFinite(highlightClipRatio) ? highlightClipRatio : null,
      shadowClipRatio: Number.isFinite(shadowClipRatio) ? shadowClipRatio : null,
      blackOutputGuardTriggered: Boolean(renderDebugInfo?.lastFrameBlackGuardTriggered),
      suspectedBlackFrame: Boolean(pipelineInfo?.capabilities?.suspectedBlackFrame),
    };
    const parityInteractionKind =
      String(interactionKind ?? 'idle') === String(renderDebugInfo?.interactionKind ?? 'idle');
    const parityIsAdjusting = Boolean(isAdjusting) === Boolean(renderDebugInfo?.isAdjusting);
    const parityWorkbenchEngine = parityInteractionKind && parityIsAdjusting;

    const rawColorimetry = (() => {
      const cap = pipelineInfo?.capabilities;
      if (!cap || typeof cap !== 'object') {
        return null;
      }
      const probe =
        cap.rawProbeSnapshot && typeof cap.rawProbeSnapshot === 'object' ? cap.rawProbeSnapshot : null;
      const decodeAdapterId =
        typeof cap.rawDecodeAdapter === 'string'
          ? cap.rawDecodeAdapter
          : probe && typeof probe.rawDecodeAdapter === 'string'
            ? probe.rawDecodeAdapter
            : null;
      const envCam =
        typeof import.meta !== 'undefined'
          ? String(import.meta.env?.VITE_FILMLAB_RAW_LIBRAW_CAMERA_PROFILE ?? '').trim() || null
          : null;
      const envMx =
        typeof import.meta !== 'undefined'
          ? String(import.meta.env?.VITE_FILMLAB_RAW_LIBRAW_USE_CAMERA_MATRIX ?? '').trim() || null
          : null;
      return {
        schema: 'mindfullens.raw-colorimetry.v1',
        colorPipeline: cap.colorPipeline ?? probe?.colorPipeline ?? null,
        librawDevelopSettings: cap.librawDevelopSettings ?? null,
        librawMetadataSummary: cap.librawMetadataSummary ?? null,
        rawRecovery2d: cap.rawRecovery2d ?? null,
        decodeAdapterId,
        rawDecodeAdapterPhase: cap.rawDecodeAdapterPhase ?? null,
        env: {
          librawCameraProfile: envCam,
          librawUseCameraMatrix: envMx,
        },
      };
    })();

    const report = {
      schema: 'mindfullens.render-debug.v3',
      generatedAt: new Date().toISOString(),
      app: {
        route: typeof window !== 'undefined' ? window.location?.href ?? '' : '',
        /** `location.origin` — krótszy klucz grupowania niż pełny `route`. */
        locationOrigin: (() => {
          if (typeof window === 'undefined') {
            return null;
          }
          const o = window.location?.origin;
          return typeof o === 'string' && o !== '' ? o : null;
        })(),
        mode: resolvedAppMode,
        /** Vite `base` z bundla (`import.meta.env.BASE_URL`); np. `/` vs segment pod GitHub Pages — baseline deploy. */
        viteBaseUrl: String(import.meta?.env?.BASE_URL ?? '/'),
        /** Jak na canvasie (Status) — pełna etykieta serwisowa + dev suffix z `buildInfo.js`. */
        serviceBuildLabel: SERVICE_BUILD_LABEL,
        /** Krótki tag buildu (`sv-…`) — ten sam co w etykiecie serwisowej, bez dev-suffixu czasu/SHA. */
        serviceBuildTag: SERVICE_BUILD_TAG,
        /** Marker synchronizacji plan ↔ repo (viewport / wiring); `buildInfo.js`. */
        viewportBuildMarker: VIEWPORT_BUILD_MARKER,
        /** Migawka `runtimeStatusBadge` z `useFilmLabRenderDebugStatusLabels` w chwili eksportu (§9.12 baseline). */
        runtimeStatusBadge:
          runtimeStatusBadge != null && String(runtimeStatusBadge).trim() !== ''
            ? String(runtimeStatusBadge)
            : null,
        /** Jak w Render Debug / statusie — aktywny tor preview w chwili eksportu. */
        previewPathLabel: previewPathLabel != null ? String(previewPathLabel) : null,
      },
      environment: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        language: typeof navigator !== 'undefined' ? navigator.language : '',
        platform: typeof navigator !== 'undefined' ? navigator.platform : '',
        /** Liczba logicznych rdzeni (baseline / §9.12); `null` gdy API niedostępne. */
        hardwareConcurrency: (() => {
          const n =
            typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : NaN;
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        })(),
        /** GiB, często tylko Chromium; inaczej `null`. */
        deviceMemoryGb: (() => {
          const n = typeof navigator !== 'undefined' ? Number(navigator.deviceMemory) : NaN;
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),
        screen:
          typeof screen !== 'undefined'
            ? {
                width: screen.width ?? null,
                height: screen.height ?? null,
                availWidth: screen.availWidth ?? null,
                availHeight: screen.availHeight ?? null,
              }
            : null,
        /** IANA (np. `Europe/Warsaw`) gdy dostępne; ułatwia baseline przy różnych hostach. */
        timeZone: (() => {
          try {
            const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return typeof z === 'string' && z.trim() !== '' ? z : null;
          } catch {
            return null;
          }
        })(),
        /** Jak `Date#getTimezoneOffset()` — offset w minutach względem UTC dla lokalnej strefy. */
        timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
        /** `document.visibilityState` w chwili eksportu — przy `hidden` throttling może zafałszować E2E. */
        pageVisibilityState:
          typeof document !== 'undefined' ? document.visibilityState ?? null : null,
        pageHidden: typeof document !== 'undefined' ? Boolean(document.hidden) : null,
        /** `navigator.onLine` (best-effort; nie zastępuje pomiaru sieci). */
        onLine: typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : null,
        /** `globalThis.isSecureContext` — m.in. dostępność części API na HTTPS / localhost. */
        isSecureContext:
          typeof globalThis !== 'undefined' ? Boolean(globalThis.isSecureContext) : null,
        /** COOP+COEP; wpływa na `SharedArrayBuffer` w main (por. plan, spike SAB). */
        crossOriginIsolated:
          typeof globalThis !== 'undefined' && 'crossOriginIsolated' in globalThis
            ? Boolean(globalThis.crossOriginIsolated)
            : null,
        /** Typowa automatyzacja (Playwright/Selenium); baseline preferuje `false`. */
        webdriver:
          typeof navigator !== 'undefined' && 'webdriver' in navigator
            ? Boolean(navigator.webdriver)
            : null,
        /** Chromium: `performance.memory`; inaczej `null` (bez narzutu w innych silnikach). */
        jsHeap: (() => {
          if (typeof performance === 'undefined' || !performance.memory) {
            return null;
          }
          const m = performance.memory;
          return {
            usedJSHeapSize: m.usedJSHeapSize ?? null,
            totalJSHeapSize: m.totalJSHeapSize ?? null,
            jsHeapSizeLimit: m.jsHeapSizeLimit ?? null,
          };
        })(),
        /** `dark` / `light` / `no-preference` — `prefers-color-scheme` (baseline). */
        prefersColorScheme: (() => {
          if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return null;
          }
          try {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
            if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
          } catch {
            return null;
          }
          return 'no-preference';
        })(),
        /** `true` gdy użytkownik preferuje redukcję ruchu w UI. */
        prefersReducedMotion: (() => {
          if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return null;
          }
          try {
            return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
          } catch {
            return null;
          }
        })(),
        /** `navigator.maxTouchPoints` (0 = brak dotyku zwykle). */
        maxTouchPoints: (() => {
          const n =
            typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints) : NaN;
          return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
        })(),
        /** Najszerszy dopasowany gamut z `color-gamut` (display / baseline koloru). */
        colorGamut: (() => {
          if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return null;
          }
          try {
            if (window.matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
            if (window.matchMedia('(color-gamut: p3)').matches) return 'p3';
            if (window.matchMedia('(color-gamut: srgb)').matches) return 'srgb';
          } catch {
            return null;
          }
          return null;
        })(),
        /** `true` przy `(pointer: coarse)` — zwykle touch-first. */
        pointerCoarse: (() => {
          if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return null;
          }
          try {
            return Boolean(window.matchMedia('(pointer: coarse)').matches);
          } catch {
            return null;
          }
        })(),
        /** `true` przy `(hover: none)` — brak precyzyjnego hover (np. telefon). */
        hoverNone: (() => {
          if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return null;
          }
          try {
            return Boolean(window.matchMedia('(hover: none)').matches);
          } catch {
            return null;
          }
        })(),
        /** Client Hints (Chromium): `brands`, `mobile`, `platform` — bez async high-entropy. */
        userAgentData: (() => {
          const ua = typeof navigator !== 'undefined' ? navigator.userAgentData : null;
          if (!ua || typeof ua !== 'object') {
            return null;
          }
          try {
            const rawBrands = ua.brands;
            const brands = Array.isArray(rawBrands)
              ? rawBrands.map((b) => ({
                  brand: b && typeof b.brand === 'string' ? b.brand : null,
                  version: b && typeof b.version === 'string' ? b.version : null,
                }))
              : null;
            return {
              brands,
              mobile: typeof ua.mobile === 'boolean' ? ua.mobile : null,
              platform: typeof ua.platform === 'string' ? ua.platform : null,
            };
          } catch {
            return null;
          }
        })(),
        /** Network Information API (best-effort); `null` gdy brak `navigator.connection`. */
        networkConnection: (() => {
          const c = typeof navigator !== 'undefined' ? navigator.connection : null;
          if (!c || typeof c !== 'object') {
            return null;
          }
          try {
            const downlink = Number(c.downlink);
            const rtt = Number(c.rtt);
            return {
              effectiveType: typeof c.effectiveType === 'string' ? c.effectiveType : null,
              downlinkMbps: Number.isFinite(downlink) ? downlink : null,
              rttMs: Number.isFinite(rtt) ? Math.floor(rtt) : null,
              saveData: typeof c.saveData === 'boolean' ? c.saveData : null,
            };
          } catch {
            return null;
          }
        })(),
        /** `PerformanceNavigationTiming.type` — np. `navigate`, `reload`, `back_forward`. */
        navigationType: (() => {
          try {
            const list =
              typeof performance !== 'undefined' &&
              typeof performance.getEntriesByType === 'function'
                ? performance.getEntriesByType('navigation')
                : null;
            const nav = Array.isArray(list) && list.length > 0 ? list[0] : null;
            const t = nav && typeof nav.type === 'string' ? nav.type : null;
            return t && t !== '' ? t : null;
          } catch {
            return null;
          }
        })(),
        webgpu: {
          api: renderDebugInfo?.webGpuApi ?? getWebGpuApiExposure(),
          adapter: renderDebugInfo?.webGpuAdapter ?? { status: 'unknown' },
          adapterInfo: renderDebugInfo?.webGpuAdapterInfo ?? null,
          device: renderDebugInfo?.webGpuDevice ?? { status: 'unknown' },
        },
        webgpuWorker: renderDebugInfo?.webGpuWorker ?? { status: 'unknown' },
        sharedArrayBuffer: renderDebugInfo?.sharedArrayBufferHost ?? getSharedArrayBufferHostSnapshot(),
        viewport:
          typeof window !== 'undefined'
            ? {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1,
              }
            : null,
      },
      flags: {
        showRenderDebugPanel: SHOW_RENDER_DEBUG_PANEL,
        env: {
          debugPanel: readEnvFlag(import.meta?.env?.VITE_FILMLAB_DEBUG_PANEL),
          workerDrag: readEnvFlag(import.meta?.env?.VITE_FILMLAB_WORKER_DRAG),
          proxyGpu: readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_GPU),
          webgpuProxy: readEnvFlag(import.meta?.env?.VITE_FILMLAB_WEBGPU_PROXY),
          mainPreviewWebGpuAb: readEnvFlag(import.meta?.env?.VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB),
          proxyForceCpuRequested: readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_FORCE_CPU),
          batchPerf: readEnvFlag(import.meta?.env?.VITE_FILMLAB_BATCH_PERF),
          /** Dev: `server.watch.usePolling` w `vite.config.js` (`npm run dev:*:poll`). W buildzie prod. zwykle `false`. */
          devWatchPoll: readEnvFlag(import.meta?.env?.VITE_FILMLAB_DEV_WATCH_POLL),
          fastWebgl2: readEnvFlag(import.meta?.env?.VITE_FILMLAB_FAST_WEBGL2),
          fastFbo16fOptOut: readEnvNegated(import.meta?.env?.VITE_FILMLAB_FAST_FBO16F),
          proxyMatchPreview: readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_MATCH_PREVIEW),
          /** §5.1.1.2 — `isEnvCpuPreviewMatchNominal()` w `runtimeEnv.js`. */
          cpuPreviewMatchNominal: readEnvFlag(
            import.meta?.env?.VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL
          ),
          proxyOutputTiles: readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_OUTPUT_TILES),
          proxyCpuYieldEvery: (() => {
            const v = import.meta?.env?.VITE_FILMLAB_PROXY_CPU_YIELD_EVERY;
            if (v == null || String(v).trim() === '') {
              return null;
            }
            return String(v).trim();
          })(),
          e2eHostSchedRaf: isEnvE2eHostSchedRaf(),
          /** Zgodnie z `ENABLE_PREVIEW_LUTS` w `filmProfiles.js` (`isEnvEnablePreviewLuts`). */
          enablePreviewLuts: isEnvEnablePreviewLuts(),
          enablePreviewLutsViteRaw: getViteEnablePreviewLutsRaw(),
          disableCopyProtection: readEnvFlag(
            import.meta?.env?.VITE_DISABLE_COPY_PROTECTION
          ),
          dev: Boolean(import.meta?.env?.DEV),
          prod: Boolean(import.meta?.env?.PROD),
          /** Vite `import.meta.env.SSR` — w kliencie Film Lab zwykle `false`; `true` = nietypowy bundel SSR. */
          ssr: Boolean(import.meta?.env?.SSR),
        },
        effective: {
          workerDragEnabled: Boolean(renderDebugInfo?.workerDragEnabled),
          proxyGpuEnabled: Boolean(renderDebugInfo?.proxyGpuEnabled),
          webgpuProxyBuild: Boolean(renderDebugInfo?.webgpuProxyBuild),
          proxyForceCpuFallback: Boolean(renderDebugInfo?.proxyForceCpuFallback),
        },
        runtime: {
          workerDragEnabled: Boolean(renderDebugInfo?.workerDragEnabled),
          proxyGpuEnabled: Boolean(renderDebugInfo?.proxyGpuEnabled),
          webgpuProxyBuild: Boolean(renderDebugInfo?.webgpuProxyBuild),
          proxyForceCpuFallback: Boolean(renderDebugInfo?.proxyForceCpuFallback),
          proxyLastFrameGpuImpl: renderDebugInfo?.proxyLastFrameGpuImpl ?? null,
          proxyWorkerWebGpuCanvasFormat: renderDebugInfo?.proxyWorkerWebGpuCanvasFormat ?? null,
          proxyWorkerWebGpuDeviceLimits: renderDebugInfo?.proxyWorkerWebGpuDeviceLimits ?? null,
          proxyWorkerWebGlMaxTex2d: renderDebugInfo?.proxyWorkerWebGlMaxTex2d ?? null,
          proxyWorkerWebGlMaxTex3d: renderDebugInfo?.proxyWorkerWebGlMaxTex3d ?? null,
          proxyWorkerWebGlRgba16f: renderDebugInfo?.proxyWorkerWebGlRgba16f ?? null,
          proxyWorkerWebGlFbo16fBlit: renderDebugInfo?.proxyWorkerWebGlFbo16fBlit ?? null,
          proxyWorkerWebGl3dLutRgba16f: renderDebugInfo?.proxyWorkerWebGl3dLutRgba16f ?? null,
          proxyWorkerGpuTexW: renderDebugInfo?.proxyWorkerGpuTexW ?? null,
          proxyWorkerGpuTexH: renderDebugInfo?.proxyWorkerGpuTexH ?? null,
          proxyWorkerFullSourceW: renderDebugInfo?.proxyWorkerFullSourceW ?? null,
          proxyWorkerFullSourceH: renderDebugInfo?.proxyWorkerFullSourceH ?? null,
          proxyWorkerGpuInputTexDownscaled: isProxyWorkerGpuInputTexDownscaled(renderDebugInfo),
          proxyWorkerProxyOutputFitted: isProxyWorkerProxyOutputFitted(renderDebugInfo),
          proxyWorkerProxyOutputRequestedW: renderDebugInfo?.proxyWorkerProxyOutputRequestedW ?? null,
          proxyWorkerProxyOutputRequestedH: renderDebugInfo?.proxyWorkerProxyOutputRequestedH ?? null,
          proxyWorkerProxyOutputTargetW: renderDebugInfo?.proxyWorkerProxyOutputTargetW ?? null,
          proxyWorkerProxyOutputTargetH: renderDebugInfo?.proxyWorkerProxyOutputTargetH ?? null,
          proxyWorkerOutputFitStatusLabel: getProxyWorkerOutputFitStatusLabel(renderDebugInfo),
          proxyWorkerOutputTileCountNominal: renderDebugInfo?.proxyWorkerOutputTileCountNominal ?? null,
          proxyWorkerOutputTileCountTarget: renderDebugInfo?.proxyWorkerOutputTileCountTarget ?? null,
          /** Ostatnia klatka CPU workera: pełny bufer nominal (parity kafle `PROXY_OUTPUT_TILES`). */
          proxyWorkerCpuFullNominalParity: renderDebugInfo?.proxyWorkerCpuFullNominalParity ?? null,
          proxyWorkerNominalW: renderDebugInfo?.proxyWorkerNominalW ?? null,
          proxyWorkerNominalH: renderDebugInfo?.proxyWorkerNominalH ?? null,
          proxyWorkerProxyMaxEffective: renderDebugInfo?.proxyWorkerProxyMaxEffective ?? null,
          proxyInputBufferW: renderDebugInfo?.proxyInputBufferW ?? null,
          proxyInputBufferH: renderDebugInfo?.proxyInputBufferH ?? null,
          previewE2eIntentToPresentMs: renderDebugInfo?.previewE2eIntentToPresentMs ?? null,
          previewE2ePath: renderDebugInfo?.previewE2ePath ?? null,
          previewE2eMedianMs: renderDebugInfo?.previewE2eMedianMs ?? null,
          previewE2eKpiTargetMs: renderDebugInfo?.previewE2eKpiTargetMs ?? null,
          previewE2eKpiState: renderDebugInfo?.previewE2eKpiState ?? null,
          previewE2ePerPathStats: renderDebugInfo?.previewE2ePerPathStats ?? null,
          /** Skrót A/B: porównanie median E2E `fast-main-webgpu-ab` vs `fast-webgl` (gdy oba dostępne). */
          previewE2eAbSummary: (() => {
            const stats = renderDebugInfo?.previewE2ePerPathStats;
            if (!stats || typeof stats !== 'object') {
              return null;
            }
            const webgpu = stats['fast-main-webgpu-ab'];
            const webgl = stats['fast-webgl'];
            if (!webgpu && !webgl) {
              return null;
            }
            const webgpuMedian = Number(webgpu?.medianMs);
            const webglMedian = Number(webgl?.medianMs);
            const hasBoth = Number.isFinite(webgpuMedian) && Number.isFinite(webglMedian);
            const deltaMs = hasBoth ? Number((webgpuMedian - webglMedian).toFixed(2)) : null;
            return {
              webgpuMedianMs: Number.isFinite(webgpuMedian) ? webgpuMedian : null,
              webglMedianMs: Number.isFinite(webglMedian) ? webglMedian : null,
              webgpuCount: Number.isFinite(Number(webgpu?.count)) ? Math.floor(Number(webgpu.count)) : null,
              webglCount: Number.isFinite(Number(webgl?.count)) ? Math.floor(Number(webgl.count)) : null,
              deltaMs,
              fasterPath: hasBoth ? (deltaMs <= 0 ? 'webgpu' : 'webgl') : null,
            };
          })(),
          previewE2eDragToPresentMs: renderDebugInfo?.previewE2eDragToPresentMs ?? null,
          previewE2ePointerToPresentMs: renderDebugInfo?.previewE2ePointerToPresentMs ?? null,
          previewE2eHostSchedToRafMs: renderDebugInfo?.previewE2eHostSchedToRafMs ?? null,
          previewE2eFrameCostMs: renderDebugInfo?.previewE2eFrameCostMs ?? null,
          previewE2eFrameCostMedianMs: renderDebugInfo?.previewE2eFrameCostMedianMs ?? null,
          previewE2eFrameCostKpiTargetMs: renderDebugInfo?.previewE2eFrameCostKpiTargetMs ?? null,
          previewE2eFrameCostKpiState: renderDebugInfo?.previewE2eFrameCostKpiState ?? null,
          previewE2eFrameCostPerPathStats: renderDebugInfo?.previewE2eFrameCostPerPathStats ?? null,
          previewE2eFrameCostGateDecision: renderDebugInfo?.previewE2eFrameCostGateDecision ?? null,
          previewE2eFrameCostGateReady: renderDebugInfo?.previewE2eFrameCostGateReady ?? null,
          previewE2eFrameCostGateSummary: renderDebugInfo?.previewE2eFrameCostGateSummary ?? null,
          previewE2eFrameCostGateThresholds: {
            targetMs: PREVIEW_E2E_FRAME_COST_TARGET_MS,
            minSamples: PREVIEW_E2E_FRAME_COST_GATE_MIN_SAMPLES,
          },
          previewE2eFrameCostGateThresholdsHint: getPreviewE2eFrameCostGateThresholdsHint(),
          /** Stan workbencha (props `interactionKind` / `isAdjusting`); do porównania z polami `engine*`. */
          workbenchInteractionKind: String(interactionKind ?? 'idle'),
          workbenchIsAdjusting: Boolean(isAdjusting),
          /** Jak w panelu: efektywne `interactionKind` / `isAdjusting` w silniku (engineAdjustments). */
          engineInteractionKind: renderDebugInfo?.interactionKind ?? null,
          engineIsAdjusting: renderDebugInfo?.isAdjusting ?? null,
          /** `true` gdy workbench (props) i silnik raportują to samo — regresja / QA. */
          parityInteractionKind,
          parityIsAdjusting,
          /** Skrót: `parityInteractionKind && parityIsAdjusting`. */
          parityWorkbenchEngine,
          /** Wartość `renderDebugInfo.e2ePanning` (options.e2eIsPanning z hosta) w chwili eksportu. */
          e2ePanning: renderDebugInfo?.e2ePanning ?? null,
          /** Migawka z `getFilmLabE2ePointerAuxSession()` w chwili eksportu (np. rękojeść cadru). */
          e2ePointerAux: getFilmLabE2ePointerAuxSession(),
          /** Sesja E2E v3 po skrócie klawiszowym (`markFilmLabE2eKeyboardE2eIntent`); konsumowana po prezentacji klatki. */
          e2ePointerKeyboard: getFilmLabE2eKeyboardSession(),
          fastPreviewMainThreadSourceTexFormat:
            renderDebugInfo?.fastPreviewMainThreadSourceTexFormat ?? null,
          fastPreviewGlContext: renderDebugInfo?.fastPreviewGlContext ?? null,
          fastPreviewFloatPipeline: renderDebugInfo?.fastPreviewFloatPipeline ?? null,
          fastPreviewLutAtlasTexFormat: renderDebugInfo?.fastPreviewLutAtlasTexFormat ?? null,
          fastPreviewGradingPrecision: renderDebugInfo?.fastPreviewGradingPrecision ?? null,
          proxyMatchPreviewBuffer: readEnvFlag(
            typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FILMLAB_PROXY_MATCH_PREVIEW : undefined
          ),
          proxyWorkerOutputTileStatusLabel: getProxyWorkerOutputTileStatusLabel(renderDebugInfo),
          proxyWorkerGpuInputDownscaleMs: renderDebugInfo?.proxyWorkerGpuInputDownscaleMs ?? null,
          proxyWorkerWebGpuSourceTexFormat: renderDebugInfo?.proxyWorkerWebGpuSourceTexFormat ?? null,
          proxyWorkerWebGpuLut3dTexFormat: renderDebugInfo?.proxyWorkerWebGpuLut3dTexFormat ?? null,
          proxyWorkerWebGpuReadbackRgba8: renderDebugInfo?.proxyWorkerWebGpuReadbackRgba8 ?? null,
          proxyWorkerWebGpuReadbackChroma: renderDebugInfo?.proxyWorkerWebGpuReadbackChroma ?? null,
          proxyWorkerGpuRenderMs: renderDebugInfo?.proxyWorkerGpuRenderMs ?? null,
          proxyWorkerCpuRenderMs: renderDebugInfo?.proxyWorkerCpuRenderMs ?? null,
          mainThreadWebGpuPreviewAbEnabled: Boolean(renderDebugInfo?.mainThreadWebGpuPreviewAbEnabled),
          mainThreadWebGpuPreviewAbDecision: renderDebugInfo?.mainThreadWebGpuPreviewAbDecision ?? null,
          mainThreadWebGpuPreviewAbPath: renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? null,
          mainThreadWebGpuPreviewAbRenderMs: renderDebugInfo?.mainThreadWebGpuPreviewAbRenderMs ?? null,
          mainThreadWebGpuPreviewAbSourceTexFormat:
            renderDebugInfo?.mainThreadWebGpuPreviewAbSourceTexFormat ?? null,
          mainThreadWebGpuPreviewAbFramesTotal:
            renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal ?? null,
          mainThreadWebGpuPreviewAbFramesWebGpuMain:
            renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain ?? null,
          mainThreadWebGpuPreviewAbFramesWebGlFallback:
            renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback ?? null,
          mainThreadWebGpuPreviewAbWebGpuRatio:
            renderDebugInfo?.mainThreadWebGpuPreviewAbWebGpuRatio ?? null,
          mainThreadWebGpuPreviewAbHealthState:
            renderDebugInfo?.mainThreadWebGpuPreviewAbHealthState ?? null,
          mainThreadWebGpuPreviewAbFallbackRate:
            renderDebugInfo?.mainThreadWebGpuPreviewAbFallbackRate ?? null,
          mainThreadWebGpuPreviewAbHealthFrames:
            renderDebugInfo?.mainThreadWebGpuPreviewAbHealthFrames ?? null,
          mainThreadWebGpuPreviewAbThresholds: {
            healthWarmupFrames: MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS.healthWarmupFrames,
            healthWarnFallbackRate: MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS.healthWarnFallbackRate,
            gateReadyMinFrames: MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS.gateReadyMinFrames,
          },
          mainThreadWebGpuPreviewAbThresholdsHint:
            `Thresholds: ${getMainPreviewAbRolloutHealthThresholdsHint()} | ${getMainPreviewAbRolloutGateThresholdsHint()}`,
          /** Skrót tekstowy rolloutu A/B (`webgpu-main` vs fallback) do szybkiego skanu raportu. */
          mainThreadWebGpuPreviewAbRolloutSummary: (() => {
            const total = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal);
            const main = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain);
            const fallback = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback);
            if (!Number.isFinite(total) || total <= 0) {
              return null;
            }
            const ratio =
              Number.isFinite(main) && main >= 0
                ? Number(((main / total) * 100).toFixed(1))
                : null;
            const m = Number.isFinite(main) ? Math.floor(main) : 0;
            const f = Number.isFinite(fallback) ? Math.floor(fallback) : Math.max(0, Math.floor(total) - m);
            return `webgpu-main ${ratio != null ? `${ratio}%` : 'n/a'} (${m}/${Math.floor(total)}) · fallback ${f}`;
          })(),
          /** Prosty status zdrowia rolloutu A/B na bazie fallback-rate (diagnostyka, nie hard gate CI). */
          mainThreadWebGpuPreviewAbHealth: (() => {
            const health = getMainPreviewAbRolloutHealthInfo(renderDebugInfo);
            return {
              state: health.state,
              fallbackRate: health.fallbackRate,
              totalFrames: health.n,
            };
          })(),
          /** Jednolinijkowy skrót health (do szybkiego skanu logów/DIAG bez rozwijania obiektu). */
          mainThreadWebGpuPreviewAbHealthSummary: (() => {
            return getMainPreviewAbRolloutHealthInfo(renderDebugInfo).summaryLabel;
          })(),
          /** Zero-jedynkowy sygnał gotowości rolloutu (próg operacyjny: min. 60 klatek i health=ok). */
          mainThreadWebGpuPreviewAbRolloutReady: (() => {
            return getMainPreviewAbRolloutGateInfo(renderDebugInfo).isReady;
          })(),
          /** Jednolinijkowy skrót gate rolloutu (`READY`/`HOLD`) z licznością próbek. */
          mainThreadWebGpuPreviewAbRolloutGateSummary: (() => {
            return getMainPreviewAbRolloutGateInfo(renderDebugInfo).exportSummary;
          })(),
          proxyWebGpuDeviceLost: Boolean(renderDebugInfo?.proxyWebGpuDeviceLost),
          proxyWebGpuDeviceLostAt: renderDebugInfo?.proxyWebGpuDeviceLostAt ?? null,
          proxyWebGpuDeviceLostMessage: renderDebugInfo?.proxyWebGpuDeviceLostMessage ?? null,
          proxyWebGpuReinitFailedAt: renderDebugInfo?.proxyWebGpuReinitFailedAt ?? null,
          proxyWebGpuReinitFailedMessage: renderDebugInfo?.proxyWebGpuReinitFailedMessage ?? null,
          mainThreadWebGpuPreviewStatus: renderDebugInfo?.mainThreadWebGpuPreviewStatus ?? null,
          mainThreadWebGpuMaxTextureDimension2d:
            renderDebugInfo?.mainThreadWebGpuMaxTextureDimension2d ?? null,
          mainThreadWebGpuMaxTextureDimension3d:
            renderDebugInfo?.mainThreadWebGpuMaxTextureDimension3d ?? null,
          mainThreadWebGpuLut3dTexFormat: renderDebugInfo?.mainThreadWebGpuLut3dTexFormat ?? null,
          /** `true` gdy oba formaty znane i równe; `false` gdy oba znane i różne; inaczej `null`. */
          webGpuLut3dMainWorkerFormatMatch: (() => {
            const w = renderDebugInfo?.proxyWorkerWebGpuLut3dTexFormat;
            const m = renderDebugInfo?.mainThreadWebGpuLut3dTexFormat;
            if (w == null || m == null) {
              return null;
            }
            return String(w) === String(m);
          })(),
          mainThreadWebGpuCanvasClearPass: renderDebugInfo?.mainThreadWebGpuCanvasClearPass ?? null,
          mainThreadWebGpuSolidDrawPass: renderDebugInfo?.mainThreadWebGpuSolidDrawPass ?? null,
          mainThreadWebGpuTextureDrawPass: renderDebugInfo?.mainThreadWebGpuTextureDrawPass ?? null,
          mainThreadWebGpuProxyShaderDrawPass: renderDebugInfo?.mainThreadWebGpuProxyShaderDrawPass ?? null,
          mainThreadWebGpuHostSourceProxyPass: renderDebugInfo?.mainThreadWebGpuHostSourceProxyPass ?? null,
          mainThreadWebGpuHostSourceReadbackRgba8:
            renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8 ?? null,
          mainThreadWebGpuHostSourceReadbackChroma:
            renderDebugInfo?.mainThreadWebGpuHostSourceReadbackChroma ?? null,
          /** `true` gdy oba readbacki znane (RGBA×4) i zgodne R,G,B; `false` gdy oba znane i różne; inaczej `null`. */
          webGpuReadbackMainWorkerRgba3Match: (() => {
            const w = renderDebugInfo?.proxyWorkerWebGpuReadbackRgba8;
            const m = renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8;
            if (!Array.isArray(w) || w.length < 3 || !Array.isArray(m) || m.length < 3) {
              return null;
            }
            return [0, 1, 2].every(
              (i) => Math.floor(Number(w[i])) === Math.floor(Number(m[i])),
            );
          })(),
          cpuParityNominalW: renderDebugInfo?.cpuParityNominalW ?? null,
          cpuParityNominalH: renderDebugInfo?.cpuParityNominalH ?? null,
          cpuParityProxyMax: renderDebugInfo?.cpuParityProxyMax ?? null,
          cpuParityBufferW: renderDebugInfo?.cpuParityBufferW ?? null,
          cpuParityBufferH: renderDebugInfo?.cpuParityBufferH ?? null,
          cpuParityMatchNominal: renderDebugInfo?.cpuParityMatchNominal ?? null,
          /** `true` gdy `VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL` + udany downscale do nominalu. */
          cpuParityDownscaled: renderDebugInfo?.cpuParityDownscaled ?? null,
          sharedArrayBufferHost: renderDebugInfo?.sharedArrayBufferHost ?? getSharedArrayBufferHostSnapshot(),
          proxyWorkerStatus: renderDebugInfo?.proxyWorkerStatus ?? null,
          rawBackendMode,
          rawBackendPreference,
          rawLinearStageMode,
          rawLinearStageOverride,
        },
      },
      source: {
        fileName: uploadedFile?.name ?? null,
        fileType: uploadedFile?.type ?? null,
        fileSize: uploadedFile?.size ?? null,
        fileLastModified: uploadedFile?.lastModified ?? null,
        imageMeta,
        exifMeta,
      },
      pipeline: {
        label: getPipelineLabel(pipelineInfo),
        info: pipelineInfo ?? null,
        rawBackendComparison: rawAbTest
          ? {
              executed: Boolean(rawAbTest?.executed),
              reason: rawAbTest?.reason ?? null,
              winner: rawAbWinner || null,
              selectedBackend: rawAbSelectedBackend,
              scoreDelta: rawAbScoreDelta,
              primary: {
                backend: rawAbTest?.primary?.backend ?? null,
                score: Number.isFinite(rawAbPrimaryScore) ? rawAbPrimaryScore : null,
                stats: rawAbTest?.primary?.stats ?? null,
              },
              alternate: rawAbTest?.alternate
                ? {
                    backend: rawAbTest?.alternate?.backend ?? null,
                    score: Number.isFinite(rawAbAlternateScore) ? rawAbAlternateScore : null,
                    stats: rawAbTest?.alternate?.stats ?? null,
                  }
                : null,
              alternateError: rawAbTest?.alternateError ?? null,
              diffHeatmap: rawAbTest?.diffHeatmap
                ? {
                    width: Number(rawAbTest?.diffHeatmap?.width) || null,
                    height: Number(rawAbTest?.diffHeatmap?.height) || null,
                    meanDelta: Number.isFinite(Number(rawAbTest?.diffHeatmap?.meanDelta))
                      ? Number(rawAbTest.diffHeatmap.meanDelta)
                      : null,
                    p95Delta: Number.isFinite(Number(rawAbTest?.diffHeatmap?.p95Delta))
                      ? Number(rawAbTest.diffHeatmap.p95Delta)
                      : null,
                    maxDelta: Number.isFinite(Number(rawAbTest?.diffHeatmap?.maxDelta))
                      ? Number(rawAbTest.diffHeatmap.maxDelta)
                      : null,
                    hasDataUrl:
                      typeof rawAbTest?.diffHeatmap?.dataUrl === 'string' &&
                      rawAbTest.diffHeatmap.dataUrl.startsWith('data:image/'),
                  }
                : null,
            }
          : null,
        /** Etap 2 kolorymetryka RAW: tor LibRaw (DCP/ICC v0), etap po stronie bridge, zmienne VITE. */
        rawColorimetry,
      },
      render: {
        isProcessing,
        showInlineProcessing,
        isAdjusting,
        interactionKind,
        previewPathLabel,
        alert: renderPipelineAlert ?? null,
        fallback: {
          code: fallbackCode,
          explanation: fallbackCode ? fallbackExplanation : null,
          mainPreviewAbCode: mainPreviewAbFallbackCode,
          mainPreviewAbExplanation: mainPreviewAbFallbackExplanation,
          mainPreviewAbDecision: mainPreviewAbDecision || null,
          mainPreviewAbPath: mainPreviewAbPath || null,
        },
        debug: renderDebugInfo ?? null,
        qualitySignals: rawQualitySignals,
        qualityQa: rawQualityQaSummary ?? null,
      },
      profile: {
        activeFilmIndex,
        activeFilm: activeFilm
          ? {
              name: activeFilm.name ?? null,
              sub: activeFilm.sub ?? null,
              cat: activeFilm.cat ?? null,
              sourceId: activeFilm.sourceId ?? null,
              canonicalSourceId: activeFilm.canonicalSourceId ?? null,
              internalSourceId: activeFilm.internalSourceId ?? null,
              isInputProfile: Boolean(activeFilm.isInputProfile),
            }
          : null,
      },
      adjustments,
      userCurves,
      colorMixer,
      colorGrading,
      colorCalibration,
      batchState,
      performance: {
        batchPerfEnabled: IS_BATCH_PERF_ENABLED,
        lastBatchZip: getLastBatchPerfSnapshot(),
      },
    };

    try {
      const payload = JSON.stringify(report, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mindfullens_render_debug_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDebugExportFeedback('saved');
      setTimeout(() => setDebugExportFeedback(null), 1500);
    } catch (error) {
      console.error('[FilmLab] Failed to export debug report', error);
      setDebugExportFeedback('error');
      setTimeout(() => setDebugExportFeedback(null), 1800);
    }
  }, [
    activeFilm,
    activeFilmIndex,
    adjustments,
    batchState,
    colorCalibration,
    colorGrading,
    colorMixer,
    exifMeta,
    fallbackExplanation,
    imageMeta,
    interactionKind,
    isAdjusting,
    isProcessing,
    pipelineInfo,
    previewPathLabel,
    renderPipelineAlert,
    renderDebugInfo,
    runtimeStatusBadge,
    rawQualityQaSummary,
    rawBackendMode,
    rawBackendPreference,
    rawLinearStageMode,
    rawLinearStageOverride,
    showInlineProcessing,
    uploadedFile,
    userCurves,
  ]);

  return {
    exportDebugReport,
    debugExportFeedback,
  };
}
