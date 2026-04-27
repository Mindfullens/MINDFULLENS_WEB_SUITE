import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

/**
 * Regresja: opcjonalny WebGL2 w szybkim podglądzie (główny wątek) — env + telemetria.
 * Nie uruchamia przeglądarki.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const runEnv = read('src/filmLab/runtimeEnv.js');
assert.match(runEnv, /isEnvEnablePreviewLuts/);
assert.match(runEnv, /readEnvNegated/);

const fast = read('src/engine/preview/fastPreviewRenderer.js');
assert.match(fast, /readEnvNegated/);
assert.match(fast, /VITE_FILMLAB_FAST_WEBGL2/);
assert.match(fast, /readEnvFlag/);
assert.match(fast, /getContext\(\s*['"]webgl2['"]/);
assert.match(fast, /buildFastPreviewRendererForContext/);
assert.match(fast, /buildFastPreviewRendererForContext\([^,]+,[^,]+,\s*'webgl2'\)/);
assert.match(fast, /buildFastPreviewRendererForContext\([^,]+,[^,]+,\s*'webgl'\)/);
assert.match(fast, /contextApi,/);
assert.match(fast, /floatPipeline/);
assert.match(fast, /fboRgba16f/);
assert.match(fast, /VITE_FILMLAB_FAST_FBO16F/);
assert.match(fast, /probeWebgl2Rgba16fFboUsable/);
const webgl2Probe = read('src/engine/webgl2Rgba16fFboProbe.js');
assert.match(webgl2Probe, /probeWebgl2Rgba16fFboUsable/);
assert.match(fast, /probeLutRgba16f2dLinearUsable/);
assert.match(fast, /u8RgbaToHalfFloatRgbaForTexImage/);
assert.match(fast, /from ['"]\.\.\/webglU8RgbaToHalfFloat\.js['"]/);
assert.match(fast, /lutAtlasTexFormat/);
assert.match(fast, /gradingFragmentPrecision/);
assert.match(fast, /precision highp float/);

const engine = read('src/engine/useFilmLabEngine.js');
assert.match(engine, /fastPreviewGlContext/);
assert.match(engine, /created\.contextApi/);
assert.match(engine, /fastPreviewFloatPipeline/);
assert.match(engine, /floatPipeline/);
assert.match(engine, /fastPreviewLutAtlasTexFormat/);
assert.match(engine, /lutAtlasTexFormat/);
assert.match(engine, /fastPreviewGradingPrecision/);
assert.match(engine, /gradingFragmentPrecision/);
assert.match(engine, /interactionKind: String\(adjustments\?\.interactionKind/);
assert.match(engine, /e2ePanning/);
assert.match(engine, /options\?\.e2eIsPanning/);
assert.match(engine, /computeE2eFrameCostMedianSnapshot/);
assert.match(engine, /withPreviewE2eFrameCostGate/);
assert.match(engine, /previewE2eFrameCostGateReady/);
assert.match(engine, /const ENABLE_MAIN_PREVIEW_WEBGPU_AB = isEnvMainPreviewWebGpuAb\(\);/);
assert.match(
  engine,
  /const abArmed =\s*\n\s*ENABLE_MAIN_PREVIEW_WEBGPU_AB &&\s*\n\s*String\(renderDebugInfo\?\.mainThreadWebGpuPreviewAbDecision \?\? ''\)\.startsWith\('armed_probe_ok'\);/,
);
assert.match(engine, /const fastE2ePath = usedMainThreadWebGpuAb \? 'fast-main-webgpu-ab' : 'fast-webgl';/);
assert.match(
  engine,
  /mainThreadWebGpuPreviewAbPath:\s*ENABLE_MAIN_PREVIEW_WEBGPU_AB\s*\n\s*\?\s*usedMainThreadWebGpuAb\s*\n\s*\?\s*'webgpu-main'\s*\n\s*:\s*'webgl-fallback'\s*\n\s*:\s*'none'/,
);
assert.match(engine, /let usedMainThreadWebGpuAbSourceTexFormat = null/);
assert.match(engine, /usedMainThreadWebGpuAbSourceTexFormat\s*=\s*\n\s*tr\.sourceTexFormat != null \? String\(tr\.sourceTexFormat\) : 'rgba8unorm'/);
assert.match(
  engine,
  /mainThreadWebGpuPreviewAbSourceTexFormat:\s*ENABLE_MAIN_PREVIEW_WEBGPU_AB\s*\n\s*\?\s*usedMainThreadWebGpuAb\s*\n\s*\?\s*usedMainThreadWebGpuAbSourceTexFormat \?\? 'rgba8unorm'\s*\n\s*:\s*null\s*\n\s*:\s*null/,
);

const viteEnv = read('src/vite-env.d.ts');
assert.match(viteEnv, /VITE_FILMLAB_FAST_WEBGL2/);
assert.match(viteEnv, /VITE_FILMLAB_FAST_FBO16F/);
assert.match(viteEnv, /VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL/);
assert.match(viteEnv, /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/);

const envEx = read('.env.example');
assert.match(envEx, /VITE_FILMLAB_FAST_WEBGL2/);
assert.match(envEx, /VITE_FILMLAB_FAST_FBO16F/);
assert.match(envEx, /VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL/);
assert.match(envEx, /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/);

const pkg = read('package.json');
assert.match(pkg, /dev:fast-webgl2/);
assert.match(pkg, /dev:fast-webgl2:match/);
assert.match(pkg, /dev:fast-webgl2:match:webgpu/);
assert.match(pkg, /dev:fast-webgl2:match:cpu-nominal/);
assert.match(pkg, /dev:fast-webgl2:match:cpu-nominal:webgpu/);
assert.match(pkg, /preview:fast-webgl2:match/);
assert.match(pkg, /preview:fast-webgl2:match:webgpu/);
assert.match(pkg, /preview:fast-webgl2:match:cpu-nominal/);
assert.match(pkg, /preview:fast-webgl2:match:cpu-nominal:webgpu/);
assert.match(pkg, /"build:preview:fast-webgl2:match":/);
assert.match(pkg, /build:preview:fast-webgl2:match:webgpu/);
assert.match(pkg, /build:preview:fast-webgl2:match:cpu-nominal/);
assert.match(pkg, /build:preview:fast-webgl2:match:cpu-nominal:webgpu/);
assert.match(pkg, /VITE_FILMLAB_FAST_WEBGL2/);
assert.match(pkg, /dev:cpu-preview-match-nominal/);
assert.match(pkg, /VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL/);
assert.match(pkg, /dev:proxy-cpu-yield/);
assert.match(pkg, /dev:proxy-output-tiles:yield/);
assert.match(pkg, /build:preview:proxy-output-tiles:yield/);
assert.match(pkg, /build:preview:proxy-cpu-yield/);

const panel = read('src/FilmLabRenderDebugPanel.jsx');
assert.match(panel, /isEnvEnablePreviewLuts/);
assert.match(panel, /readEnvFlag\(\s*import\.meta\?\.env\?\.VITE_FILMLAB_PROXY_MATCH_PREVIEW/);
assert.match(panel, /fastPreviewGlContext/);
assert.match(panel, /fastPreviewFloatPipeline/);
assert.match(panel, /fastPreviewLutAtlasTexFormat/);
assert.match(panel, /fastPreviewGradingPrecision/);
assert.match(panel, /Interaction \(engine\)/);
assert.match(panel, /renderDebugInfo\?\.interactionKind/);
assert.match(panel, /Adjusting \(engine\)/);
assert.match(panel, /renderDebugInfo\?\.isAdjusting/);
assert.match(panel, /E2E \(pan\)/);
assert.match(panel, /renderDebugInfo\?\.e2ePanning/);
assert.match(panel, /E2E \(aux\)/);
assert.match(panel, /getFilmLabE2ePointerAuxSession/);

const statusLabels = read('src/filmLab/useFilmLabRenderDebugStatusLabels.js');
assert.match(statusLabels, /mainThreadWebGpuPreviewAbRolloutReady/);
assert.match(statusLabels, /getMainPreviewAbRolloutGateInfo/);
assert.match(statusLabels, /runtimeStatusSegments/);
assert.match(
  statusLabels,
  /rolloutSummary,\s*rolloutHealth,\s*rolloutReady,\s*frameCostGate,\s*abSummary,\s*e2eWarn/,
);

const overlays = read('src/FilmLabCanvasPipelineOverlays.jsx');
assert.match(overlays, /parseAbDeltaFromRuntimeBadge/);
assert.match(overlays, /parseE2eWarnFromRuntimeBadge/);
assert.match(overlays, /parseRolloutGateFromRuntimeBadge/);
assert.match(overlays, /parseRolloutHealthFromRuntimeBadge/);
assert.match(overlays, /getMainPreviewAbRolloutHealthThresholdsHint/);
assert.match(overlays, /getMainPreviewAbRolloutGateThresholdsHint/);
assert.match(overlays, /E2E warn:/);
assert.match(overlays, /A\/B delta:/);
assert.match(overlays, /Rollout health:/);
assert.match(overlays, /Rollout gate:/);
assert.match(overlays, /Thresholds:/);

const rolloutGate = read('src/filmLab/rolloutGate.js');
assert.match(rolloutGate, /PREVIEW_E2E_FRAME_COST_TARGET_MS/);
assert.match(rolloutGate, /getPreviewE2eFrameCostGateInfo/);
assert.match(rolloutGate, /fc-gate:/);
assert.match(rolloutGate, /MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES/);
assert.match(rolloutGate, /MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES/);
assert.match(rolloutGate, /MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE/);
assert.match(rolloutGate, /MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS/);
assert.match(rolloutGate, /getMainPreviewAbRolloutHealthInfo/);
assert.match(rolloutGate, /getMainPreviewAbRolloutGateInfo/);
assert.match(rolloutGate, /getMainPreviewAbRolloutHealthThresholdsHint/);
assert.match(rolloutGate, /getMainPreviewAbRolloutGateThresholdsHint/);
assert.match(rolloutGate, /parseAbDeltaFromRuntimeBadge/);
assert.match(rolloutGate, /parseE2eWarnFromRuntimeBadge/);
assert.match(rolloutGate, /parseRolloutGateFromRuntimeBadge/);
assert.match(rolloutGate, /parseRolloutHealthFromRuntimeBadge/);
assert.match(rolloutGate, /rollout:\$\{decision\}/);

const exportDebug = read('src/filmLab/useFilmLabExportDebugReport.js');
assert.match(exportDebug, /schema:\s*'mindfullens\.render-debug\.v3'/);
assert.match(exportDebug, /generatedAt:\s*new Date\(\)\.toISOString\(\)/);
assert.match(exportDebug, /showRenderDebugPanel:\s*SHOW_RENDER_DEBUG_PANEL/);
assert.match(
  exportDebug,
  /effective:\s*\{[\s\S]*?proxyForceCpuFallback:\s*Boolean\(renderDebugInfo\?\.proxyForceCpuFallback\),/,
);
assert.match(exportDebug, /batchPerfEnabled:\s*IS_BATCH_PERF_ENABLED/);
assert.match(exportDebug, /lastBatchZip:\s*getLastBatchPerfSnapshot/);
assert.match(exportDebug, /label:\s*getPipelineLabel\(pipelineInfo\)/);
assert.match(exportDebug, /info:\s*pipelineInfo \?\? null/);
assert.match(exportDebug, /rawBackendComparison:\s*rawAbTest\s*\n\s*\? \{/);
assert.match(
  exportDebug,
  /source:\s*\{[\s\S]*?\n\s*\},\s*\n\s*pipeline:\s*\{[\s\S]*?\n\s*\},\s*\n\s*render:\s*\{[\s\S]*?\n\s*\},\s*\n\s*profile:\s*\{/,
);
assert.match(exportDebug, /fileName:\s*uploadedFile\?\.name/);
assert.match(exportDebug, /fileSize:\s*uploadedFile\?\.size/);
assert.match(exportDebug, /fileType:\s*uploadedFile\?\.type \?\? null/);
assert.match(exportDebug, /fileLastModified:\s*uploadedFile\?\.lastModified \?\? null/);
assert.match(exportDebug, /source:\s*\{[\s\S]*?imageMeta,[\s\S]*?exifMeta,/);
assert.match(exportDebug, /profile:\s*\{\s*\n\s*activeFilmIndex,/);
assert.match(exportDebug, /activeFilm:\s*activeFilm\s*\n\s*\? \{/);
assert.match(exportDebug, /sourceId:\s*activeFilm\.sourceId \?\? null/);
assert.match(
  exportDebug,
  /render:\s*\{\s*\n\s*isProcessing,\s*\n\s*showInlineProcessing,\s*\n\s*isAdjusting,/,
);
assert.match(exportDebug, /isAdjusting,\s*\n\s*interactionKind,\s*\n\s*previewPathLabel,/);
assert.match(exportDebug, /alert:\s*renderPipelineAlert \?\? null/);
assert.match(exportDebug, /fallback:\s*\{\s*\n\s*code:\s*fallbackCode,/);
assert.match(exportDebug, /mainPreviewAbCode:\s*mainPreviewAbFallbackCode/);
assert.match(exportDebug, /mainPreviewAbExplanation:\s*mainPreviewAbFallbackExplanation/);
assert.match(exportDebug, /mainPreviewAbDecision:\s*mainPreviewAbDecision \|\| null/);
assert.match(exportDebug, /mainPreviewAbPath:\s*mainPreviewAbPath \|\| null/);
assert.match(exportDebug, /qualitySignals:\s*rawQualitySignals/);
assert.match(exportDebug, /qualityQa:\s*rawQualityQaSummary \?\? null/);
assert.match(exportDebug, /debug:\s*renderDebugInfo \?\? null/);
assert.match(
  exportDebug,
  /proxyWorkerStatus:\s*renderDebugInfo\?\.proxyWorkerStatus \?\? null,\s*\n\s*rawBackendMode,\s*\n\s*rawBackendPreference,\s*\n\s*rawLinearStageMode,\s*\n\s*rawLinearStageOverride,/,
);
assert.match(
  exportDebug,
  /adjustments,\s*\n\s*userCurves,\s*\n\s*colorMixer,\s*\n\s*colorGrading,\s*\n\s*colorCalibration,/,
);
assert.match(exportDebug, /colorCalibration,\s*\n\s*batchState,\s*\n\s*performance:/);
assert.match(exportDebug, /SERVICE_BUILD_LABEL,\s*SERVICE_BUILD_TAG,\s*VIEWPORT_BUILD_MARKER/);
assert.match(exportDebug, /const resolvedAppMode =/);
assert.match(exportDebug, /mode:\s*resolvedAppMode/);
assert.match(exportDebug, /viteBaseUrl:\s*String\(import\.meta/);
assert.match(exportDebug, /serviceBuildLabel:\s*SERVICE_BUILD_LABEL/);
assert.match(exportDebug, /serviceBuildTag:\s*SERVICE_BUILD_TAG/);
assert.match(exportDebug, /viewportBuildMarker:\s*VIEWPORT_BUILD_MARKER/);
assert.match(exportDebug, /previewPathLabel:\s*previewPathLabel/);
assert.match(exportDebug, /route:\s*typeof window/);
assert.match(exportDebug, /locationOrigin:/);
assert.match(exportDebug, /runtimeStatusBadge/);
assert.match(exportDebug, /hardwareConcurrency:/);
assert.match(exportDebug, /deviceMemoryGb:/);
assert.match(exportDebug, /availWidth:/);
assert.match(exportDebug, /viewport:/);
assert.match(exportDebug, /width:\s*window\.innerWidth/);
assert.match(exportDebug, /devicePixelRatio:\s*window\.devicePixelRatio/);
assert.match(exportDebug, /api:\s*renderDebugInfo\?\.webGpuApi \?\? getWebGpuApiExposure/);
assert.match(exportDebug, /webgpuWorker:\s*renderDebugInfo\?\.webGpuWorker/);
assert.match(
  exportDebug,
  /sharedArrayBuffer:\s*renderDebugInfo\?\.sharedArrayBufferHost \?\? getSharedArrayBufferHostSnapshot/,
);
assert.match(exportDebug, /timeZone:/);
assert.match(exportDebug, /timeZoneOffsetMinutes:/);
assert.match(exportDebug, /pageVisibilityState:/);
assert.match(exportDebug, /pageHidden:/);
assert.match(exportDebug, /onLine:/);
assert.match(exportDebug, /isSecureContext:/);
assert.match(exportDebug, /crossOriginIsolated:/);
assert.match(exportDebug, /webdriver:/);
assert.match(exportDebug, /jsHeap:/);
assert.match(exportDebug, /prefersColorScheme:/);
assert.match(exportDebug, /prefersReducedMotion:/);
assert.match(exportDebug, /maxTouchPoints:/);
assert.match(exportDebug, /colorGamut:/);
assert.match(exportDebug, /pointerCoarse:/);
assert.match(exportDebug, /hoverNone:/);
assert.match(exportDebug, /userAgentData:/);
assert.match(exportDebug, /networkConnection:/);
assert.match(exportDebug, /navigationType:/);
assert.match(exportDebug, /getMainPreviewAbRolloutGateInfo/);
assert.match(exportDebug, /getMainPreviewAbRolloutHealthInfo/);
assert.match(exportDebug, /disableCopyProtection/);
assert.match(exportDebug, /devWatchPoll:/);
assert.match(exportDebug, /mainPreviewWebGpuAb:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /proxyGpu:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /webgpuProxy:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /batchPerf:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /fastWebgl2:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /proxyMatchPreview:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /debugPanel:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /workerDrag:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /proxyForceCpuRequested:\s*readEnvFlag\(import\.meta/);
assert.match(exportDebug, /fastFbo16fOptOut:\s*readEnvNegated\(import\.meta/);
assert.match(exportDebug, /proxyOutputTiles:\s*readEnvFlag\(import\.meta/);
assert.match(
  exportDebug,
  /cpuPreviewMatchNominal:\s*readEnvFlag\(\s*\n\s*import\.meta\?\.env\?\.VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL/,
);
assert.match(exportDebug, /proxyCpuYieldEvery:\s*\(\(\)\s*=>/);
assert.match(exportDebug, /e2eHostSchedRaf:\s*isEnvE2eHostSchedRaf\(\)/);
assert.match(exportDebug, /enablePreviewLuts:\s*isEnvEnablePreviewLuts\(\)/);
assert.match(exportDebug, /enablePreviewLutsViteRaw:\s*getViteEnablePreviewLutsRaw\(\)/);
assert.match(
  exportDebug,
  /disableCopyProtection:\s*readEnvFlag\(\s*\n\s*import\.meta\?\.env\?\.VITE_DISABLE_COPY_PROTECTION/,
);
assert.match(exportDebug, /\bdev:\s*Boolean\(import\.meta/);
assert.match(exportDebug, /\bprod:\s*Boolean\(import\.meta/);
assert.match(exportDebug, /\bssr:\s*Boolean\(import\.meta/);
assert.match(exportDebug, /readEnvNegated/);
assert.match(exportDebug, /fastFbo16fOptOut/);
assert.match(exportDebug, /fastWebgl2/);
assert.match(exportDebug, /proxyOutputTiles/);
assert.match(exportDebug, /enablePreviewLuts/);
assert.match(exportDebug, /enablePreviewLutsViteRaw/);
assert.match(exportDebug, /getViteEnablePreviewLutsRaw/);
assert.match(exportDebug, /workbenchInteractionKind/);
assert.match(exportDebug, /workbenchIsAdjusting/);
assert.match(exportDebug, /engineInteractionKind/);
assert.match(exportDebug, /engineIsAdjusting/);
assert.match(exportDebug, /parityInteractionKind/);
assert.match(exportDebug, /parityIsAdjusting/);
assert.match(exportDebug, /parityWorkbenchEngine/);
assert.match(exportDebug, /e2ePanning: renderDebugInfo/);
assert.match(exportDebug, /e2ePointerAux/);
assert.match(exportDebug, /e2ePointerKeyboard/);
assert.match(exportDebug, /getFilmLabE2ePointerAuxSession/);
assert.match(exportDebug, /proxyMatchPreviewBuffer: readEnvFlag/);
assert.match(exportDebug, /fastPreviewGlContext/);
assert.match(exportDebug, /fastPreviewFloatPipeline/);
assert.match(exportDebug, /fastPreviewLutAtlasTexFormat/);
assert.match(exportDebug, /fastPreviewGradingPrecision/);
assert.match(exportDebug, /mainThreadWebGpuPreviewStatus/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbEnabled/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbDecision/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbPath/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbRenderMs/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbSourceTexFormat/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbFramesTotal/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbFramesWebGpuMain/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbFramesWebGlFallback/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbWebGpuRatio/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbHealthState/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbFallbackRate/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbHealthFrames/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbThresholds/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbThresholdsHint/);
assert.match(exportDebug, /Thresholds:/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbRolloutSummary/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbHealth/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbHealthSummary/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbRolloutReady/);
assert.match(exportDebug, /mainThreadWebGpuPreviewAbRolloutGateSummary/);
assert.match(exportDebug, /mainThreadWebGpuMaxTextureDimension2d/);
assert.match(exportDebug, /mainThreadWebGpuMaxTextureDimension3d/);
assert.match(exportDebug, /mainThreadWebGpuLut3dTexFormat/);
assert.match(exportDebug, /webGpuLut3dMainWorkerFormatMatch/);
assert.match(exportDebug, /mainThreadWebGpuCanvasClearPass/);
assert.match(exportDebug, /mainThreadWebGpuSolidDrawPass/);
assert.match(exportDebug, /mainThreadWebGpuTextureDrawPass/);
assert.match(exportDebug, /mainThreadWebGpuProxyShaderDrawPass/);
assert.match(exportDebug, /mainThreadWebGpuHostSourceProxyPass/);
assert.match(exportDebug, /mainThreadWebGpuHostSourceReadbackRgba8/);
assert.match(exportDebug, /proxyWorkerWebGpuReadbackRgba8/);
assert.match(exportDebug, /webGpuReadbackMainWorkerRgba3Match/);
assert.match(exportDebug, /previewE2eHostSchedToRafMs/);
assert.match(exportDebug, /previewE2eMedianMs/);
assert.match(exportDebug, /previewE2eKpiState/);
assert.match(exportDebug, /previewE2ePerPathStats/);
assert.match(exportDebug, /previewE2eAbSummary/);
assert.match(exportDebug, /previewE2eFrameCostMs/);
assert.match(exportDebug, /previewE2eFrameCostMedianMs/);
assert.match(exportDebug, /previewE2eFrameCostKpiState/);
assert.match(exportDebug, /previewE2eFrameCostPerPathStats/);
assert.match(exportDebug, /previewE2eFrameCostGateDecision/);
assert.match(exportDebug, /previewE2eFrameCostGateThresholdsHint/);
assert.match(exportDebug, /e2eHostSchedRaf/);
assert.match(exportDebug, /sharedArrayBufferHost/);
assert.match(exportDebug, /sharedArrayBuffer:\s*renderDebugInfo\?\.sharedArrayBufferHost \?\? getSharedArrayBufferHostSnapshot/);
assert.match(exportDebug, /cpuParityMatchNominal/);
assert.match(exportDebug, /cpuParityDownscaled/);
assert.match(exportDebug, /cpuPreviewMatchNominal/);
assert.match(exportDebug, /proxyWorkerCpuFullNominalParity/);
assert.match(exportDebug, /proxyCpuYieldEvery/);
assert.match(exportDebug, /proxyWorkerWebGlRgba16f/);
assert.match(exportDebug, /proxyWorkerWebGlFbo16fBlit/);
assert.match(exportDebug, /proxyWorkerWebGl3dLutRgba16f/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatWebGpuLut3dMainWorkerParityLine/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatWebGpuReadbackMainWParityLine/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /mainThreadWebGpuLut3dTexFormat/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /mainThreadWebGpuPreviewStatus/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /mainThreadWebGpuPreviewAbDecision/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /mainThreadWebGpuPreviewAbPath/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /mainThreadWebGpuPreviewAbRenderMs/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /getMainPreviewAbFallbackReason/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /main-preview A\/B fallback:/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatWebGpuReadbackMainWParityRgb/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /Readback parity \(W=main RGB\)/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /previewE2eKpiState/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /E2E koszt klatki/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /getPreviewE2eFrameCostGateInfo/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatPreviewE2ePerPathStats/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatPreviewE2eAbSummary/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatMainPreviewAbRolloutHealth/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatMainPreviewAbRolloutHealthSummary/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /getMainPreviewAbRolloutHealthTone/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatMainPreviewAbRolloutGate/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /getMainPreviewAbRolloutGateTone/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /getMainPreviewAbRolloutHealthThresholdsHint/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /getMainPreviewAbRolloutGateThresholdsHint/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /render-debug-inline-health/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /render-debug-health-legend/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /Legenda health rolloutu A\/B/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /A\/B rollout health/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /A\/B rollout gate/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatSharedArrayBufferHostLine/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /policy /);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /smoke /);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /proxyWorkerCpuFullNominalParity/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /formatViteProxyCpuYieldEvery/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /W · CPU yield/);
assert.match(read('src/FilmLabRenderDebugPanel.jsx'), /W · GL 3D LUT/);

const viteConfig = read('vite.config.js');
assert.match(viteConfig, /host:\s*true/, 'vite.config: host true (LAN)');
const viteAllowedHosts = viteConfig.match(/allowedHosts:\s*true/g);
assert.ok(
  viteAllowedHosts && viteAllowedHosts.length >= 2,
  'vite.config: allowedHosts true for server + preview',
);
assert.match(viteConfig, /VITE_FILMLAB_DEV_WATCH_POLL/, 'vite.config: dev watch poll flag');
