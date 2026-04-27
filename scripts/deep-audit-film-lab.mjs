import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { filmStocks } from '../src/engine/filmProfiles.js';
import {
  mapKelvinToTemperature,
  mapTemperatureToKelvin,
} from '../src/engine/sliderResponseMap.js';
import { resolveWhiteBalanceGains } from '../src/engine/whiteBalance.js';
import { __FILMLAB_INTERNALS } from '../src/engine/useFilmLabEngine.js';
import {
  fitSourceInsideMaxTextureEdge,
  isDownscaleOutputWithinPixelBudget,
} from '../src/engine/proxySourceDownscale.js';
import { doesRectExceedMaxTexture2dEdge } from '../src/engine/proxyGpu2dRectLimit.js';
import { fitNominalToMaxTexture2dEdge } from '../src/engine/proxyNominalOutputFit.js';
import { FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT } from '../src/engine/preview/fastPreviewConstants.js';
import { isEnvEnablePreviewLuts } from '../src/filmLab/runtimeEnv.js';

const {
  buildWorkerAdjustmentsPayload,
  buildFastPreviewAdjustments,
  IDENTITY_CURVES,
} = __FILMLAB_INTERNALS;

const PROFILE_STATUSES = ['ready', 'loading', 'failed', 'idle'];
const INTERACTIONS = [
  'idle',
  'curve',
  'slider:exposure',
  'slider:contrast',
  'slider:highlights',
  'slider:shadows',
  'slider:whites',
  'slider:blacks',
  'slider:temp',
  'slider:tint',
  'slider:dehaze',
  'slider:clarity',
  'slider:mixer-red',
  'slider:grade-midtones-saturation',
  'slider:calibration-shadows-tint',
];

const NUMERIC_CHECK_KEYS = [
  'fastExposure',
  'fastContrast',
  'fastSaturation',
  'fastVibrance',
  'fastFade',
  'fastHighlights',
  'fastShadows',
  'fastWhites',
  'fastBlacks',
  'fastDehaze',
  'fastClarity',
  'fastWbR',
  'fastWbG',
  'fastWbB',
];

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomInRange(min, max + 1));
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createIdentityCurves() {
  return {
    rgb: IDENTITY_CURVES.rgb.map((point) => [...point]),
    r: IDENTITY_CURVES.r.map((point) => [...point]),
    g: IDENTITY_CURVES.g.map((point) => [...point]),
    b: IDENTITY_CURVES.b.map((point) => [...point]),
  };
}

function createRandomCurve() {
  const count = randomInt(2, 6);
  const points = [
    [0, 0],
    [255, 255],
  ];
  for (let i = 0; i < count - 2; i += 1) {
    points.push([randomInt(1, 254), randomInt(1, 254)]);
  }
  points.sort((left, right) => left[0] - right[0]);

  // Keep X strictly increasing.
  for (let i = 1; i < points.length - 1; i += 1) {
    points[i][0] = clamp(points[i][0], points[i - 1][0] + 1, points[i + 1][0] - 1);
  }

  return points;
}

function createRandomCurves() {
  return {
    rgb: Math.random() < 0.6 ? createIdentityCurves().rgb : createRandomCurve(),
    r: Math.random() < 0.75 ? createIdentityCurves().r : createRandomCurve(),
    g: Math.random() < 0.75 ? createIdentityCurves().g : createRandomCurve(),
    b: Math.random() < 0.75 ? createIdentityCurves().b : createRandomCurve(),
  };
}

function buildRandomAdjustments() {
  return {
    strength: randomInt(0, 100),
    exposure: randomInt(-100, 100),
    contrast: randomInt(-100, 100),
    highlights: randomInt(-100, 100),
    shadows: randomInt(-100, 100),
    whites: randomInt(-100, 100),
    blacks: randomInt(-100, 100),
    temp: randomInt(-100, 100),
    tint: randomInt(-100, 100),
    saturation: randomInt(-100, 100),
    vibrance: randomInt(-100, 100),
    fade: randomInt(0, 100),
    clarity: randomInt(-100, 100),
    dehaze: randomInt(-100, 100),
    userGrain: randomInt(0, 100),
    userGrainSize: randomInt(10, 100),
    userVignette: randomInt(0, 100),
    chromAb: randomInt(0, 100),
    bloom: randomInt(0, 100),
    halation: randomInt(0, 100),
    halRadius: randomInt(5, 80),
    halThresh: randomInt(0, 255),
    halHue: randomInt(-100, 100),
    anamorph: randomInt(0, 100),
    streakLen: randomInt(10, 100),
    showClipping: Math.random() < 0.5,
    isAdjusting: Math.random() < 0.5,
    interactionKind: randomChoice(INTERACTIONS),
    curveLumaMix: randomInt(0, 100),
    userCurves: createRandomCurves(),
    userHsl: null,
    userColorGrade: null,
    userCalibration: null,
  };
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * p))
  );
  return sortedValues[index];
}

function collectProfileLutCoverage() {
  const publicLutDir = path.resolve('public/luts');
  const existing = new Set(
    fs.existsSync(publicLutDir) ? fs.readdirSync(publicLutDir).filter((entry) => entry.endsWith('.cube')) : []
  );
  const required = filmStocks
    .filter((profile) => !profile?.isInputProfile && profile?.previewLutFile)
    .map((profile) => profile.previewLutFile);
  const missing = required.filter((fileName) => !existing.has(fileName));
  return {
    requiredCount: required.length,
    existingCount: existing.size,
    missing,
  };
}

function runFuzzAndPerf(iterations = 25000) {
  const profiles = filmStocks.filter((profile) => !profile?.isInputProfile);
  const timingsMs = [];
  let clippingMismatchCount = 0;
  let numericViolations = 0;
  let wbLumaDriftMax = 0;

  for (let i = 0; i < iterations; i += 1) {
    const profile = randomChoice(profiles);
    const profileStatus = randomChoice(PROFILE_STATUSES);
    const adjustments = buildRandomAdjustments();

    const workerPayload = buildWorkerAdjustmentsPayload(adjustments, profileStatus);
    if (workerPayload.showClipping !== Boolean(adjustments.showClipping)) {
      clippingMismatchCount += 1;
    }

    const startedAt = performance.now();
    const fast = buildFastPreviewAdjustments(profile, adjustments, profileStatus);
    const elapsed = performance.now() - startedAt;
    timingsMs.push(elapsed);

    if (fast.showClipping !== Boolean(adjustments.showClipping)) {
      clippingMismatchCount += 1;
    }

    for (const key of NUMERIC_CHECK_KEYS) {
      const value = fast[key];
      if (value == null) {
        continue;
      }
      if (!Number.isFinite(value)) {
        numericViolations += 1;
      }
    }

    const wbR = Number(fast.fastWbR ?? 1);
    const wbG = Number(fast.fastWbG ?? 1);
    const wbB = Number(fast.fastWbB ?? 1);
    if (!Number.isFinite(wbR) || !Number.isFinite(wbG) || !Number.isFinite(wbB) || wbR <= 0 || wbG <= 0 || wbB <= 0) {
      numericViolations += 1;
    } else {
      const luma = wbR * 0.299 + wbG * 0.587 + wbB * 0.114;
      wbLumaDriftMax = Math.max(wbLumaDriftMax, Math.abs(luma - 1));
    }
  }

  const sortedTimings = [...timingsMs].sort((left, right) => left - right);
  const sum = timingsMs.reduce((acc, value) => acc + value, 0);
  return {
    iterations,
    clippingMismatchCount,
    numericViolations,
    wbLumaDriftMax,
    avgMs: sum / Math.max(1, timingsMs.length),
    p50Ms: percentile(sortedTimings, 0.5),
    p95Ms: percentile(sortedTimings, 0.95),
    p99Ms: percentile(sortedTimings, 0.99),
    maxMs: sortedTimings[sortedTimings.length - 1] ?? 0,
  };
}

function runWhiteBalanceMonotonicityCheck() {
  const tintSamples = [-100, -50, 0, 50, 100];
  let violations = 0;

  tintSamples.forEach((tint) => {
    let previousRatio = -Infinity;
    for (let temp = -100; temp <= 100; temp += 2) {
      const gains = resolveWhiteBalanceGains(temp, tint);
      const ratio = gains.r / gains.b;
      if (ratio + 1e-9 < previousRatio) {
        violations += 1;
      }
      previousRatio = ratio;
    }
  });

  return { tintSamples: tintSamples.length, violations };
}

function runProxySourceFitInvariants() {
  const pairs = [
    [100, 100],
    [1, 5000],
    [5000, 3000],
    [12_000, 8000],
  ];
  const edges = [256, 4096, 16_384];
  for (const M of edges) {
    for (const [sw, sh] of pairs) {
      const { width, height } = fitSourceInsideMaxTextureEdge(sw, sh, M);
      assert.ok(width >= 1 && height >= 1, `fit ${sw}x${sh} M=${M} => ${width}x${height}`);
      assert.ok(
        width <= M && height <= M,
        `fit overflow: ${sw}x${sh} M=${M} => ${width}x${height}`,
      );
    }
  }
  const hugeFit = fitSourceInsideMaxTextureEdge(200_000, 200_000, 20_000);
  assert.equal(
    isDownscaleOutputWithinPixelBudget(hugeFit.width, hugeFit.height),
    false,
    'extreme fit can exceed downscale pixel cap (worker falls back to CPU)',
  );
  assert.equal(doesRectExceedMaxTexture2dEdge(8192, 8192, 8192), false);
  assert.equal(doesRectExceedMaxTexture2dEdge(8193, 100, 8192), true);
  const nom = fitNominalToMaxTexture2dEdge(10_000, 8000, 2048);
  assert.equal(nom.fitted, true);
  assert.equal(nom.w, 2048);
  assert.equal(nom.h, 1638);
  return { cases: edges.length * pairs.length, budgetRejects: 1, nominalOutFit: 1 };
}

function runKelvinRoundtripCheck() {
  let maxError = 0;
  for (let kelvin = 2000; kelvin <= 10000; kelvin += 5) {
    const temperature = mapKelvinToTemperature(kelvin);
    const mappedKelvin = mapTemperatureToKelvin(temperature);
    const error = Math.abs(mappedKelvin - kelvin);
    maxError = Math.max(maxError, error);
  }
  return { maxError };
}

function formatMs(value) {
  return `${value.toFixed(3)} ms`;
}

function main() {
  const lutCoverage = collectProfileLutCoverage();
  const fuzz = runFuzzAndPerf(25000);
  const monotonicity = runWhiteBalanceMonotonicityCheck();
  const kelvinRoundtrip = runKelvinRoundtripCheck();
  const proxySourceFit = runProxySourceFitInvariants();

  assert.equal(
    FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT,
    'rgba8',
    'Główny szybki podgląd: upload źródła nadal LDR (por. plan §5.1, test:fast-preview-webgl2)',
  );
  assert.equal(
    isEnvEnablePreviewLuts(),
    true,
    'W audycie domyślnie włączone podglądowe LUT (VITE enable preview luts — wył. tylko =0 w env)',
  );

  const packageJsonPath = new URL('../package.json', import.meta.url);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.ok(
    packageJson?.scripts?.['build:preview:proxy-cpu-yield'],
    'package.json: build:preview:proxy-cpu-yield (dist + yield CPU workera, §5.1.1.2)',
  );
  assert.match(
    String(packageJson.scripts['build:preview:proxy-cpu-yield']),
    /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/,
  );
  assert.ok(
    packageJson?.scripts?.['dev:open:poll'],
    'package.json: dev:open:poll (Vite watch poll + open /film-lab)',
  );
  assert.match(
    String(packageJson.scripts['dev:open:poll']),
    /VITE_FILMLAB_DEV_WATCH_POLL/,
  );
  assert.ok(
    packageJson?.scripts?.['dev:webgpu:main-ab:poll'],
    'package.json: dev:webgpu:main-ab:poll',
  );

  const viteConfigPath = new URL('../vite.config.js', import.meta.url);
  const viteConfigSrc = fs.readFileSync(viteConfigPath, 'utf8');
  assert.match(viteConfigSrc, /host:\s*true/, 'vite.config: host true (listen for LAN)');
  const allowedHostsMatches = viteConfigSrc.match(/allowedHosts:\s*true/g);
  assert.ok(
    allowedHostsMatches && allowedHostsMatches.length >= 2,
    'vite.config: allowedHosts true for server + preview (LAN Host header)',
  );
  assert.match(
    viteConfigSrc,
    /VITE_FILMLAB_DEV_WATCH_POLL/,
    'vite.config: optional VITE_FILMLAB_DEV_WATCH_POLL (external volume watch)',
  );

  const planDocPath = new URL('../docs/MINDFULLENS_FILM_LAB_PLAN_V3_1.md', import.meta.url);
  const planDocSrc = fs.readFileSync(planDocPath, 'utf8');
  assert.match(
    planDocSrc,
    /#### Minimalny zestaw pól DIAG do porównań między biegami/,
    'Plan v3.1: section §9.12 minimal DIAG set exists',
  );
  assert.match(
    planDocSrc,
    /\*\*Indeks korzenia JSON \(kolejność kluczy najwyższego poziomu\):\*\*[\s\S]*?`adjustments`, `userCurves`, `colorMixer`, `colorGrading`, `colorCalibration`, `batchState`, `performance`\./,
    'Plan v3.1: root DIAG key index includes grading blobs + performance tail',
  );
  assert.match(
    planDocSrc,
    /nie\*\* są częścią „minimalnego” diffu A\/B/,
    'Plan v3.1: grading blobs explicitly marked non-minimal for A/B diff',
  );

  const exportDebugReportPath = new URL(
    '../src/filmLab/useFilmLabExportDebugReport.js',
    import.meta.url
  );
  const exportDebugReportSrc = fs.readFileSync(exportDebugReportPath, 'utf8');
  assert.match(
    exportDebugReportSrc,
    /schema:\s*'mindfullens\.render-debug\.v3'/,
    'DIAG export: schema (render-debug contract)',
  );
  assert.match(
    exportDebugReportSrc,
    /generatedAt:\s*new Date\(\)\.toISOString\(\)/,
    'DIAG export: generatedAt (ISO timestamp)',
  );
  assert.match(
    exportDebugReportSrc,
    /showRenderDebugPanel:\s*SHOW_RENDER_DEBUG_PANEL/,
    'DIAG export: flags.showRenderDebugPanel',
  );
  assert.match(
    exportDebugReportSrc,
    /effective:\s*\{[\s\S]*?proxyForceCpuFallback:\s*Boolean\(renderDebugInfo\?\.proxyForceCpuFallback\),\s*\n\s*\},\s*\n\s*runtime:/,
    'DIAG export: flags.effective (proxy/gpu quad before flags.runtime)',
  );
  assert.match(
    exportDebugReportSrc,
    /batchPerfEnabled:\s*IS_BATCH_PERF_ENABLED/,
    'DIAG export: performance.batchPerfEnabled',
  );
  assert.match(
    exportDebugReportSrc,
    /lastBatchZip:\s*getLastBatchPerfSnapshot\(\)/,
    'DIAG export: performance.lastBatchZip',
  );
  assert.match(
    exportDebugReportSrc,
    /label:\s*getPipelineLabel\(pipelineInfo\)/,
    'DIAG export: pipeline.label',
  );
  assert.match(
    exportDebugReportSrc,
    /info:\s*pipelineInfo \?\? null/,
    'DIAG export: pipeline.info',
  );
  assert.match(
    exportDebugReportSrc,
    /rawBackendComparison:\s*rawAbTest\s*\n\s*\? \{/,
    'DIAG export: pipeline.rawBackendComparison (RAW A/B)',
  );
  assert.match(
    exportDebugReportSrc,
    /source:\s*\{[\s\S]*?\n\s*\},\s*\n\s*pipeline:\s*\{[\s\S]*?\n\s*\},\s*\n\s*render:\s*\{[\s\S]*?\n\s*\},\s*\n\s*profile:\s*\{/,
    'DIAG export: root blocks order source → pipeline → render → profile',
  );
  assert.match(
    exportDebugReportSrc,
    /fileName:\s*uploadedFile\?\.name/,
    'DIAG export: source.fileName',
  );
  assert.match(
    exportDebugReportSrc,
    /fileSize:\s*uploadedFile\?\.size/,
    'DIAG export: source.fileSize',
  );
  assert.match(
    exportDebugReportSrc,
    /fileType:\s*uploadedFile\?\.type \?\? null/,
    'DIAG export: source.fileType',
  );
  assert.match(
    exportDebugReportSrc,
    /fileLastModified:\s*uploadedFile\?\.lastModified \?\? null/,
    'DIAG export: source.fileLastModified',
  );
  assert.match(
    exportDebugReportSrc,
    /source:\s*\{[\s\S]*?imageMeta,[\s\S]*?exifMeta,/,
    'DIAG export: source.imageMeta + source.exifMeta',
  );
  assert.match(
    exportDebugReportSrc,
    /profile:\s*\{\s*\n\s*activeFilmIndex,/,
    'DIAG export: profile.activeFilmIndex',
  );
  assert.match(
    exportDebugReportSrc,
    /activeFilm:\s*activeFilm\s*\n\s*\? \{/,
    'DIAG export: profile.activeFilm object',
  );
  assert.match(
    exportDebugReportSrc,
    /sourceId:\s*activeFilm\.sourceId \?\? null/,
    'DIAG export: profile.activeFilm.sourceId',
  );
  assert.match(
    exportDebugReportSrc,
    /render:\s*\{\s*\n\s*isProcessing,\s*\n\s*showInlineProcessing,\s*\n\s*isAdjusting,/,
    'DIAG export: render processing/adjusting snapshot',
  );
  assert.match(
    exportDebugReportSrc,
    /isAdjusting,\s*\n\s*interactionKind,\s*\n\s*previewPathLabel,/,
    'DIAG export: render interactionKind + previewPathLabel',
  );
  assert.match(
    exportDebugReportSrc,
    /alert:\s*renderPipelineAlert \?\? null/,
    'DIAG export: render.alert',
  );
  assert.match(
    exportDebugReportSrc,
    /fallback:\s*\{\s*\n\s*code:\s*fallbackCode,/,
    'DIAG export: render.fallback',
  );
  assert.match(
    exportDebugReportSrc,
    /mainPreviewAbCode:\s*mainPreviewAbFallbackCode/,
    'DIAG export: render.fallback.mainPreviewAbCode',
  );
  assert.match(
    exportDebugReportSrc,
    /mainPreviewAbExplanation:\s*mainPreviewAbFallbackExplanation/,
    'DIAG export: render.fallback.mainPreviewAbExplanation',
  );
  assert.match(
    exportDebugReportSrc,
    /mainPreviewAbDecision:\s*mainPreviewAbDecision \|\| null/,
    'DIAG export: render.fallback.mainPreviewAbDecision',
  );
  assert.match(
    exportDebugReportSrc,
    /mainPreviewAbPath:\s*mainPreviewAbPath \|\| null/,
    'DIAG export: render.fallback.mainPreviewAbPath',
  );
  assert.match(
    exportDebugReportSrc,
    /qualitySignals:\s*rawQualitySignals/,
    'DIAG export: render.qualitySignals',
  );
  assert.match(
    exportDebugReportSrc,
    /qualityQa:\s*rawQualityQaSummary \?\? null/,
    'DIAG export: render.qualityQa',
  );
  assert.match(
    exportDebugReportSrc,
    /debug:\s*renderDebugInfo \?\? null/,
    'DIAG export: render.debug (full renderDebugInfo)',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyWorkerStatus:\s*renderDebugInfo\?\.proxyWorkerStatus \?\? null,\s*\n\s*rawBackendMode,\s*\n\s*rawBackendPreference,\s*\n\s*rawLinearStageMode,\s*\n\s*rawLinearStageOverride,/,
    'DIAG export: flags.runtime RAW quad (end of runtime)',
  );
  assert.match(
    exportDebugReportSrc,
    /adjustments,\s*\n\s*userCurves,\s*\n\s*colorMixer,\s*\n\s*colorGrading,\s*\n\s*colorCalibration,/,
    'DIAG export: root grading blobs order (adjustments → colorCalibration)',
  );
  assert.match(
    exportDebugReportSrc,
    /colorCalibration,\s*\n\s*batchState,\s*\n\s*performance:/,
    'DIAG export: root batchState before performance',
  );
  assert.match(exportDebugReportSrc, /workbenchInteractionKind/, 'DIAG export: workbenchInteractionKind');
  assert.match(exportDebugReportSrc, /engineInteractionKind/, 'DIAG export: engineInteractionKind');
  assert.match(exportDebugReportSrc, /parityInteractionKind/, 'DIAG export: parityInteractionKind');
  assert.match(exportDebugReportSrc, /parityIsAdjusting/, 'DIAG export: parityIsAdjusting');
  assert.match(exportDebugReportSrc, /parityWorkbenchEngine/, 'DIAG export: parityWorkbenchEngine');
  assert.match(
    exportDebugReportSrc,
    /SERVICE_BUILD_LABEL,\s*SERVICE_BUILD_TAG,\s*VIEWPORT_BUILD_MARKER/,
    'DIAG export: import buildInfo (label, tag, viewport marker)',
  );
  assert.match(
    exportDebugReportSrc,
    /serviceBuildLabel:\s*SERVICE_BUILD_LABEL/,
    'DIAG export: app.serviceBuildLabel field',
  );
  assert.match(exportDebugReportSrc, /serviceBuildTag:\s*SERVICE_BUILD_TAG/, 'DIAG export: app.serviceBuildTag');
  assert.match(
    exportDebugReportSrc,
    /viewportBuildMarker:\s*VIEWPORT_BUILD_MARKER/,
    'DIAG export: app.viewportBuildMarker (plan↔repo sync)',
  );
  assert.match(
    exportDebugReportSrc,
    /runtimeStatusBadge/,
    'DIAG export: app.runtimeStatusBadge + hook wiring',
  );
  assert.match(
    exportDebugReportSrc,
    /previewPathLabel:\s*previewPathLabel/,
    'DIAG export: app.previewPathLabel (preview path at export)',
  );
  assert.match(
    exportDebugReportSrc,
    /const resolvedAppMode =/,
    'DIAG export: resolvedAppMode (app.mode fallbacks)',
  );
  assert.match(
    exportDebugReportSrc,
    /mode:\s*resolvedAppMode/,
    'DIAG export: app.mode',
  );
  assert.match(
    exportDebugReportSrc,
    /viteBaseUrl:\s*String\(import\.meta\?\.env\?\.BASE_URL/,
    'DIAG export: app.viteBaseUrl (Vite base / deploy)',
  );
  assert.match(
    exportDebugReportSrc,
    /devWatchPoll:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_DEV_WATCH_POLL\)/,
    'DIAG export: flags.env.devWatchPoll (Vite watch polling)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainPreviewWebGpuAb:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB\)/,
    'DIAG export: flags.env.mainPreviewWebGpuAb (main preview A/B)',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyGpu:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_PROXY_GPU\)/,
    'DIAG export: flags.env.proxyGpu',
  );
  assert.match(
    exportDebugReportSrc,
    /webgpuProxy:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_WEBGPU_PROXY\)/,
    'DIAG export: flags.env.webgpuProxy',
  );
  assert.match(
    exportDebugReportSrc,
    /batchPerf:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_BATCH_PERF\)/,
    'DIAG export: flags.env.batchPerf',
  );
  assert.match(
    exportDebugReportSrc,
    /fastWebgl2:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_FAST_WEBGL2\)/,
    'DIAG export: flags.env.fastWebgl2',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyMatchPreview:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_PROXY_MATCH_PREVIEW\)/,
    'DIAG export: flags.env.proxyMatchPreview',
  );
  assert.match(
    exportDebugReportSrc,
    /debugPanel:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_DEBUG_PANEL\)/,
    'DIAG export: flags.env.debugPanel',
  );
  assert.match(
    exportDebugReportSrc,
    /workerDrag:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_WORKER_DRAG\)/,
    'DIAG export: flags.env.workerDrag',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyForceCpuRequested:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_PROXY_FORCE_CPU\)/,
    'DIAG export: flags.env.proxyForceCpuRequested',
  );
  assert.match(
    exportDebugReportSrc,
    /fastFbo16fOptOut:\s*readEnvNegated\(import\.meta\?\.env\?\.VITE_FILMLAB_FAST_FBO16F\)/,
    'DIAG export: flags.env.fastFbo16fOptOut',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyOutputTiles:\s*readEnvFlag\(import\.meta\?\.env\?\.VITE_FILMLAB_PROXY_OUTPUT_TILES\)/,
    'DIAG export: flags.env.proxyOutputTiles',
  );
  assert.match(
    exportDebugReportSrc,
    /cpuPreviewMatchNominal:\s*readEnvFlag\(\s*\n\s*import\.meta\?\.env\?\.VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL\s*\n\s*\)/,
    'DIAG export: flags.env.cpuPreviewMatchNominal',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyCpuYieldEvery:\s*\(\(\)\s*=>/,
    'DIAG export: flags.env.proxyCpuYieldEvery',
  );
  assert.match(
    exportDebugReportSrc,
    /e2eHostSchedRaf:\s*isEnvE2eHostSchedRaf\(\)/,
    'DIAG export: flags.env.e2eHostSchedRaf',
  );
  assert.match(
    exportDebugReportSrc,
    /enablePreviewLuts:\s*isEnvEnablePreviewLuts\(\)/,
    'DIAG export: flags.env.enablePreviewLuts',
  );
  assert.match(
    exportDebugReportSrc,
    /enablePreviewLutsViteRaw:\s*getViteEnablePreviewLutsRaw\(\)/,
    'DIAG export: flags.env.enablePreviewLutsViteRaw',
  );
  assert.match(
    exportDebugReportSrc,
    /disableCopyProtection:\s*readEnvFlag\(\s*\n\s*import\.meta\?\.env\?\.VITE_DISABLE_COPY_PROTECTION\s*\n\s*\)/,
    'DIAG export: flags.env.disableCopyProtection',
  );
  assert.match(
    exportDebugReportSrc,
    /dev:\s*Boolean\(import\.meta\?\.env\?\.DEV\)/,
    'DIAG export: flags.env.dev (Vite DEV)',
  );
  assert.match(
    exportDebugReportSrc,
    /prod:\s*Boolean\(import\.meta\?\.env\?\.PROD\)/,
    'DIAG export: flags.env.prod (Vite PROD)',
  );
  assert.match(
    exportDebugReportSrc,
    /ssr:\s*Boolean\(import\.meta\?\.env\?\.SSR\)/,
    'DIAG export: flags.env.ssr (Vite SSR)',
  );
  assert.match(
    exportDebugReportSrc,
    /route:\s*typeof window !== 'undefined' \? window\.location\?\.href/,
    'DIAG export: app.route (full href at export)',
  );
  assert.match(
    exportDebugReportSrc,
    /width:\s*window\.innerWidth/,
    'DIAG export: environment.viewport.width',
  );
  assert.match(
    exportDebugReportSrc,
    /height:\s*window\.innerHeight/,
    'DIAG export: environment.viewport.height',
  );
  assert.match(
    exportDebugReportSrc,
    /devicePixelRatio:\s*window\.devicePixelRatio \|\| 1/,
    'DIAG export: environment.viewport.devicePixelRatio',
  );
  assert.match(
    exportDebugReportSrc,
    /api:\s*renderDebugInfo\?\.webGpuApi \?\? getWebGpuApiExposure\(\)/,
    'DIAG export: environment.webgpu.api',
  );
  assert.match(
    exportDebugReportSrc,
    /webgpuWorker:\s*renderDebugInfo\?\.webGpuWorker/,
    'DIAG export: environment.webgpuWorker',
  );
  assert.match(
    exportDebugReportSrc,
    /sharedArrayBuffer:\s*renderDebugInfo\?\.sharedArrayBufferHost \?\? getSharedArrayBufferHostSnapshot\(\)/,
    'DIAG export: environment.sharedArrayBuffer',
  );
  assert.match(
    exportDebugReportSrc,
    /locationOrigin:/,
    'DIAG export: app.locationOrigin',
  );
  assert.match(exportDebugReportSrc, /e2ePanning/, 'DIAG export: e2ePanning');
  assert.match(exportDebugReportSrc, /e2ePointerAux/, 'DIAG export: e2ePointerAux');
  assert.match(exportDebugReportSrc, /e2ePointerKeyboard/, 'DIAG export: e2ePointerKeyboard');
  assert.match(exportDebugReportSrc, /mainThreadWebGpuPreviewStatus/, 'DIAG export: mainThreadWebGpuPreviewStatus');
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuMaxTextureDimension2d/,
    'DIAG export: mainThreadWebGpuMaxTextureDimension2d (WebGPU main 2D limit)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuMaxTextureDimension3d/,
    'DIAG export: mainThreadWebGpuMaxTextureDimension3d (WebGPU main 3D limit)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuCanvasClearPass/,
    'DIAG export: mainThreadWebGpuCanvasClearPass (WebGPU main canvas clear)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuSolidDrawPass/,
    'DIAG export: mainThreadWebGpuSolidDrawPass (WebGPU main WGSL draw)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuTextureDrawPass/,
    'DIAG export: mainThreadWebGpuTextureDrawPass (WebGPU main texture sample)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuProxyShaderDrawPass/,
    'DIAG export: mainThreadWebGpuProxyShaderDrawPass (WebGPU main proxy WGSL shader)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuHostSourceProxyPass/,
    'DIAG export: mainThreadWebGpuHostSourceProxyPass (WebGPU main host RGBA8 proxy)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuHostSourceReadbackRgba8/,
    'DIAG export: mainThreadWebGpuHostSourceReadbackRgba8 (1×1 readback main sonda)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuLut3dTexFormat/,
    'DIAG export: mainThreadWebGpuLut3dTexFormat (WebGPU main 3D LUT format)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbEnabled/,
    'DIAG export: mainThreadWebGpuPreviewAbEnabled (A/B main WebGPU)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbDecision/,
    'DIAG export: mainThreadWebGpuPreviewAbDecision (A/B decision)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbPath/,
    'DIAG export: mainThreadWebGpuPreviewAbPath (A/B runtime path)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbRenderMs/,
    'DIAG export: mainThreadWebGpuPreviewAbRenderMs (A/B render ms)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbFramesTotal/,
    'DIAG export: mainThreadWebGpuPreviewAbFramesTotal (A/B frame counter)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbFramesWebGpuMain/,
    'DIAG export: mainThreadWebGpuPreviewAbFramesWebGpuMain (A/B webgpu frames)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbFramesWebGlFallback/,
    'DIAG export: mainThreadWebGpuPreviewAbFramesWebGlFallback (A/B fallback frames)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbWebGpuRatio/,
    'DIAG export: mainThreadWebGpuPreviewAbWebGpuRatio (A/B webgpu ratio)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbHealthState/,
    'DIAG export: mainThreadWebGpuPreviewAbHealthState (A/B rollout health state)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbFallbackRate/,
    'DIAG export: mainThreadWebGpuPreviewAbFallbackRate (A/B rollout fallback-rate)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbHealthFrames/,
    'DIAG export: mainThreadWebGpuPreviewAbHealthFrames (A/B rollout health frame count)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbThresholds/,
    'DIAG export: mainThreadWebGpuPreviewAbThresholds (A/B thresholds snapshot)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbThresholdsHint/,
    'DIAG export: mainThreadWebGpuPreviewAbThresholdsHint (A/B thresholds human-readable hint)',
  );
  assert.match(
    exportDebugReportSrc,
    /Thresholds:/,
    'DIAG export: thresholds hint uses tooltip-compatible "Thresholds:" prefix',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbRolloutSummary/,
    'DIAG export: mainThreadWebGpuPreviewAbRolloutSummary (A/B rollout summary)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbHealth/,
    'DIAG export: mainThreadWebGpuPreviewAbHealth (A/B rollout health)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbHealthSummary/,
    'DIAG export: mainThreadWebGpuPreviewAbHealthSummary (A/B rollout health text summary)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbRolloutReady/,
    'DIAG export: mainThreadWebGpuPreviewAbRolloutReady (A/B rollout readiness boolean)',
  );
  assert.match(
    exportDebugReportSrc,
    /mainThreadWebGpuPreviewAbRolloutGateSummary/,
    'DIAG export: mainThreadWebGpuPreviewAbRolloutGateSummary (A/B rollout gate summary text)',
  );
  assert.match(
    exportDebugReportSrc,
    /webGpuLut3dMainWorkerFormatMatch/,
    'DIAG export: webGpuLut3dMainWorkerFormatMatch (W vs main 3D LUT)',
  );
  assert.match(
    exportDebugReportSrc,
    /proxyWorkerWebGpuReadbackRgba8/,
    'DIAG export: proxyWorkerWebGpuReadbackRgba8 (worker 1x1 readback)',
  );
  assert.match(
    exportDebugReportSrc,
    /webGpuReadbackMainWorkerRgba3Match/,
    'DIAG export: webGpuReadbackMainWorkerRgba3Match (W vs main readback RGB)',
  );
  assert.match(exportDebugReportSrc, /previewE2eHostSchedToRafMs/, 'DIAG export: previewE2eHostSchedToRafMs');
  assert.match(exportDebugReportSrc, /previewE2eMedianMs/, 'DIAG export: previewE2eMedianMs (rolling median)');
  assert.match(exportDebugReportSrc, /previewE2eKpiState/, 'DIAG export: previewE2eKpiState (KPI state)');
  assert.match(exportDebugReportSrc, /previewE2ePerPathStats/, 'DIAG export: previewE2ePerPathStats (A/B by path)');
  assert.match(exportDebugReportSrc, /previewE2eAbSummary/, 'DIAG export: previewE2eAbSummary (fast webgpu vs webgl)');
  assert.match(exportDebugReportSrc, /e2eHostSchedRaf/, 'DIAG export: e2eHostSchedRaf env snapshot');
  assert.match(exportDebugReportSrc, /sharedArrayBufferHost/, 'DIAG export: sharedArrayBufferHost (SAB §5.1.1.5)');
  assert.match(exportDebugReportSrc, /sharedArrayBuffer:/, 'DIAG export: environment.sharedArrayBuffer');
  assert.match(
    exportDebugReportSrc,
    /hardwareConcurrency:/,
    'DIAG export: environment.hardwareConcurrency (baseline host fingerprint)',
  );
  assert.match(
    exportDebugReportSrc,
    /deviceMemoryGb:/,
    'DIAG export: environment.deviceMemoryGb (baseline host fingerprint)',
  );
  assert.match(
    exportDebugReportSrc,
    /availWidth:/,
    'DIAG export: environment.screen (baseline display)',
  );
  assert.match(exportDebugReportSrc, /timeZone:/, 'DIAG export: environment.timeZone (baseline locale)');
  assert.match(
    exportDebugReportSrc,
    /timeZoneOffsetMinutes:/,
    'DIAG export: environment.timeZoneOffsetMinutes',
  );
  assert.match(
    exportDebugReportSrc,
    /pageVisibilityState:/,
    'DIAG export: environment.pageVisibilityState (E2E context)',
  );
  assert.match(exportDebugReportSrc, /pageHidden:/, 'DIAG export: environment.pageHidden');
  assert.match(exportDebugReportSrc, /onLine:/, 'DIAG export: environment.onLine');
  assert.match(exportDebugReportSrc, /isSecureContext:/, 'DIAG export: environment.isSecureContext');
  assert.match(
    exportDebugReportSrc,
    /crossOriginIsolated:/,
    'DIAG export: environment.crossOriginIsolated (SAB / COOP)',
  );
  assert.match(exportDebugReportSrc, /webdriver:/, 'DIAG export: environment.webdriver');
  assert.match(exportDebugReportSrc, /jsHeap:/, 'DIAG export: environment.jsHeap (performance.memory)');
  assert.match(
    exportDebugReportSrc,
    /prefersColorScheme:/,
    'DIAG export: environment.prefersColorScheme',
  );
  assert.match(
    exportDebugReportSrc,
    /prefersReducedMotion:/,
    'DIAG export: environment.prefersReducedMotion',
  );
  assert.match(exportDebugReportSrc, /maxTouchPoints:/, 'DIAG export: environment.maxTouchPoints');
  assert.match(exportDebugReportSrc, /colorGamut:/, 'DIAG export: environment.colorGamut');
  assert.match(exportDebugReportSrc, /pointerCoarse:/, 'DIAG export: environment.pointerCoarse');
  assert.match(exportDebugReportSrc, /hoverNone:/, 'DIAG export: environment.hoverNone');
  assert.match(
    exportDebugReportSrc,
    /userAgentData:/,
    'DIAG export: environment.userAgentData (Client Hints snapshot)',
  );
  assert.match(
    exportDebugReportSrc,
    /networkConnection:/,
    'DIAG export: environment.networkConnection',
  );
  assert.match(
    exportDebugReportSrc,
    /navigationType:/,
    'DIAG export: environment.navigationType (PerformanceNavigationTiming)',
  );
  assert.match(exportDebugReportSrc, /cpuParityMatchNominal/, 'DIAG export: cpuParityMatchNominal (§5.1.1.2)');
  assert.match(exportDebugReportSrc, /cpuParityDownscaled/, 'DIAG export: cpuParityDownscaled (§5.1.1.2)');
  assert.match(
    exportDebugReportSrc,
    /proxyWorkerCpuFullNominalParity/,
    'DIAG export: proxyWorkerCpuFullNominalParity (worker CPU nominal)',
  );
  assert.match(exportDebugReportSrc, /proxyCpuYieldEvery/, 'DIAG export: proxyCpuYieldEvery (CPU worker yield)');

  const filmLabRenderDebugPath = new URL('../src/FilmLabRenderDebugPanel.jsx', import.meta.url);
  const filmLabRenderDebugSrc = fs.readFileSync(filmLabRenderDebugPath, 'utf8');
  assert.match(
    filmLabRenderDebugSrc,
    /formatViteProxyCpuYieldEvery/,
    'Panel: formatViteProxyCpuYieldEvery (W · CPU yield)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatWebGpuReadbackMainWParityLine/,
    'Panel: formatWebGpuReadbackMainWParityLine (readback W vs main rb0)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatWebGpuReadbackMainWParityRgb/,
    'Panel: formatWebGpuReadbackMainWParityRgb (readback parity RGB helper)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /Readback parity \(W=main RGB\)/,
    'Panel: readback parity row (W=main RGB)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /mainThreadWebGpuPreviewAbDecision/,
    'Panel: mainThreadWebGpuPreviewAbDecision (A/B visibility)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /getMainPreviewAbFallbackReason/,
    'Panel: helper for main-preview fallback reason',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /main-preview A\/B fallback:/,
    'Panel: main-preview fallback reason text',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /mainThreadWebGpuPreviewAbPath/,
    'Panel: mainThreadWebGpuPreviewAbPath (A/B runtime path)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /previewE2eKpiState/,
    'Panel: previewE2eKpiState (E2E KPI state)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatPreviewE2ePerPathStats/,
    'Panel: formatPreviewE2ePerPathStats (A/B by path)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatPreviewE2eAbSummary/,
    'Panel: formatPreviewE2eAbSummary (A/B summary)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatMainPreviewAbRolloutHealth/,
    'Panel: formatMainPreviewAbRolloutHealth (A/B rollout health)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatMainPreviewAbRolloutHealthSummary/,
    'Panel: formatMainPreviewAbRolloutHealthSummary (A/B health inline summary)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /formatMainPreviewAbRolloutGate/,
    'Panel: formatMainPreviewAbRolloutGate (A/B rollout gate label)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /getMainPreviewAbRolloutHealthTone/,
    'Panel: getMainPreviewAbRolloutHealthTone (A/B health inline tone)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /getMainPreviewAbRolloutGateTone/,
    'Panel: getMainPreviewAbRolloutGateTone (A/B rollout gate tone)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /getMainPreviewAbRolloutHealthThresholdsHint/,
    'Panel: getMainPreviewAbRolloutHealthThresholdsHint (shared health thresholds text)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /getMainPreviewAbRolloutGateThresholdsHint/,
    'Panel: getMainPreviewAbRolloutGateThresholdsHint (shared gate thresholds text)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /render-debug-health-legend/,
    'Panel: render-debug-health-legend (A/B health legend)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /A\/B rollout health/,
    'Panel: A/B rollout health row (toned)',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /A\/B rollout gate/,
    'Panel: A/B rollout gate row',
  );
  const renderStatusLabelsPath = new URL('../src/filmLab/useFilmLabRenderDebugStatusLabels.js', import.meta.url);
  const renderStatusLabelsSrc = fs.readFileSync(renderStatusLabelsPath, 'utf8');
  assert.match(
    renderStatusLabelsSrc,
    /mainThreadWebGpuPreviewAbRolloutReady/,
    'Status badge: mainThreadWebGpuPreviewAbRolloutReady (A/B rollout readiness input)',
  );
  assert.match(
    renderStatusLabelsSrc,
    /getMainPreviewAbRolloutGateInfo/,
    'Status badge: getMainPreviewAbRolloutGateInfo (shared rollout gate formatter)',
  );
  assert.match(
    renderStatusLabelsSrc,
    /badgeSegment/,
    'Status badge: rollout gate segment comes from shared helper',
  );
  assert.match(
    renderStatusLabelsSrc,
    /getMainPreviewAbRolloutGateInfo\(renderDebugInfo\)\.badgeSegment/,
    'Status badge: uses shared helper badgeSegment output',
  );
  assert.match(
    renderStatusLabelsSrc,
    /runtimeStatusSegments/,
    'Status badge: runtimeStatusSegments keeps deterministic segment order',
  );
  assert.match(
    renderStatusLabelsSrc,
    /rolloutSummary,\s*rolloutHealth,\s*rolloutReady,\s*frameCostGate,\s*abSummary,\s*e2eWarn/,
    'Status badge: segment order rollout->health->rollout gate->frame-cost gate->A/B->E2E WARN',
  );
  const canvasOverlaysPath = new URL('../src/FilmLabCanvasPipelineOverlays.jsx', import.meta.url);
  const canvasOverlaysSrc = fs.readFileSync(canvasOverlaysPath, 'utf8');
  assert.match(
    canvasOverlaysSrc,
    /parseAbDeltaFromRuntimeBadge/,
    'Canvas overlays: runtime badge tooltip uses shared A/B delta parser',
  );
  assert.match(
    canvasOverlaysSrc,
    /parseE2eWarnFromRuntimeBadge/,
    'Canvas overlays: runtime badge tooltip uses shared E2E warn parser',
  );
  assert.match(
    canvasOverlaysSrc,
    /parseRolloutGateFromRuntimeBadge/,
    'Canvas overlays: runtime badge tooltip uses shared rollout gate parser',
  );
  assert.match(
    canvasOverlaysSrc,
    /parseRolloutHealthFromRuntimeBadge/,
    'Canvas overlays: runtime badge tooltip uses shared rollout health parser',
  );
  assert.match(
    canvasOverlaysSrc,
    /getMainPreviewAbRolloutHealthThresholdsHint/,
    'Canvas overlays: runtime badge tooltip uses shared health thresholds hint',
  );
  assert.match(
    canvasOverlaysSrc,
    /getMainPreviewAbRolloutGateThresholdsHint/,
    'Canvas overlays: runtime badge tooltip uses shared gate thresholds hint',
  );
  assert.match(
    canvasOverlaysSrc,
    /E2E warn:/,
    'Canvas overlays: runtime badge tooltip includes E2E warn line',
  );
  assert.match(
    canvasOverlaysSrc,
    /A\/B delta:/,
    'Canvas overlays: runtime badge tooltip includes A/B delta line',
  );
  assert.match(
    canvasOverlaysSrc,
    /Rollout health:/,
    'Canvas overlays: runtime badge tooltip includes rollout health line',
  );
  assert.match(
    canvasOverlaysSrc,
    /Rollout gate:/,
    'Canvas overlays: runtime badge tooltip includes rollout gate line',
  );
  assert.match(
    canvasOverlaysSrc,
    /Thresholds:/,
    'Canvas overlays: runtime badge tooltip includes thresholds line',
  );
  const rolloutGatePath = new URL('../src/filmLab/rolloutGate.js', import.meta.url);
  const rolloutGateSrc = fs.readFileSync(rolloutGatePath, 'utf8');
  assert.match(
    rolloutGateSrc,
    /getMainPreviewAbRolloutHealthInfo/,
    'Shared helper: getMainPreviewAbRolloutHealthInfo',
  );
  assert.match(
    rolloutGateSrc,
    /parseAbDeltaFromRuntimeBadge/,
    'Shared helper: parseAbDeltaFromRuntimeBadge',
  );
  assert.match(
    rolloutGateSrc,
    /parseE2eWarnFromRuntimeBadge/,
    'Shared helper: parseE2eWarnFromRuntimeBadge',
  );
  assert.match(
    rolloutGateSrc,
    /E2E WARN/,
    'Shared helper: E2E warn parser supports runtime badge E2E token',
  );
  assert.match(
    rolloutGateSrc,
    /parseRolloutHealthFromRuntimeBadge/,
    'Shared helper: parseRolloutHealthFromRuntimeBadge',
  );
  assert.match(
    rolloutGateSrc,
    /rollout:WARN/,
    'Shared helper: health parser supports WARN with optional fallback percent',
  );
  assert.match(
    rolloutGateSrc,
    /getMainPreviewAbRolloutHealthThresholdsHint/,
    'Shared helper: getMainPreviewAbRolloutHealthThresholdsHint',
  );
  assert.match(
    rolloutGateSrc,
    /getMainPreviewAbRolloutGateThresholdsHint/,
    'Shared helper: getMainPreviewAbRolloutGateThresholdsHint',
  );
  assert.match(
    rolloutGateSrc,
    /getMainPreviewAbRolloutGateInfo/,
    'Shared helper: getMainPreviewAbRolloutGateInfo',
  );
  assert.match(
    rolloutGateSrc,
    /parseRolloutGateFromRuntimeBadge/,
    'Shared helper: parseRolloutGateFromRuntimeBadge',
  );
  assert.match(
    rolloutGateSrc,
    /rollout:\(READY\|HOLD\)\(\?:\\s\+n=\(\\d\+\)\)\?/,
    'Shared helper: parser supports READY/HOLD with optional n=…',
  );
  assert.match(
    rolloutGateSrc,
    /MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES/,
    'Shared helper: MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES threshold',
  );
  assert.match(
    rolloutGateSrc,
    /MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE/,
    'Shared helper: MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE threshold',
  );
  assert.match(
    rolloutGateSrc,
    /MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS/,
    'Shared helper: MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS snapshot object',
  );
  assert.match(
    rolloutGateSrc,
    /MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES/,
    'Shared helper: MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES threshold',
  );
  assert.match(
    rolloutGateSrc,
    /PREVIEW_E2E_FRAME_COST_TARGET_MS/,
    'Shared helper: PREVIEW_E2E_FRAME_COST_TARGET_MS (E2E frame cost KPI)',
  );
  assert.match(
    rolloutGateSrc,
    /getPreviewE2eFrameCostGateInfo/,
    'Shared helper: getPreviewE2eFrameCostGateInfo (READY/HOLD vs median)',
  );
  assert.match(
    rolloutGateSrc,
    /getPreviewE2eFrameCostGateThresholdsHint/,
    'Shared helper: getPreviewE2eFrameCostGateThresholdsHint (tooltip thresholds)',
  );
  assert.match(
    rolloutGateSrc,
    /fc-gate:/,
    'Shared helper: fc-gate segment token for runtime badge',
  );
  assert.match(exportDebugReportSrc, /cpuPreviewMatchNominal/, 'DIAG export: cpuPreviewMatchNominal env (§5.1.1.2)');
  assert.match(exportDebugReportSrc, /proxyWorkerWebGlRgba16f/, 'DIAG export: proxyWorkerWebGlRgba16f');
  assert.match(exportDebugReportSrc, /proxyWorkerWebGlFbo16fBlit/, 'DIAG export: proxyWorkerWebGlFbo16fBlit (worker FBO+blit)');
  assert.match(exportDebugReportSrc, /proxyWorkerWebGl3dLutRgba16f/, 'DIAG export: proxyWorkerWebGl3dLutRgba16f (worker 3D LUT half)');
  assert.match(exportDebugReportSrc, /getFilmLabE2ePointerAuxSession/, 'DIAG export: E2E aux snapshot');
  assert.match(exportDebugReportSrc, /getFilmLabE2eKeyboardSession/, 'DIAG export: E2E kbd snapshot');
  assert.match(exportDebugReportSrc, /previewE2eFrameCostMedianMs/, 'DIAG export: E2E frame cost median');
  assert.match(exportDebugReportSrc, /previewE2eFrameCostGateThresholdsHint/, 'DIAG export: E2E frame cost gate thresholds hint');

  const useFilmLabEnginePath = new URL('../src/engine/useFilmLabEngine.js', import.meta.url);
  const useFilmLabEngineSrc = fs.readFileSync(useFilmLabEnginePath, 'utf8');
  assert.match(
    useFilmLabEngineSrc,
    /computeMainPreviewAbRolloutHealth/,
    'Silnik: computeMainPreviewAbRolloutHealth (A/B rollout health source of truth)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /takePreviewE2ePointerToPresentMs/,
    'Silnik: takePreviewE2ePointerToPresentMs (E2E v3 konsumpcja klawiatury po klatce)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /getFilmLabE2eKeyboardSession/,
    'Silnik: import getFilmLabE2eKeyboardSession z previewE2ePointerMark',
  );
  assert.match(
    useFilmLabEngineSrc,
    /readPreviewE2ePointerContext/,
    'Silnik: readPreviewE2ePointerContext (E2E v3 kontekst pointer)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /FILM_LAB_MAIN_THREAD_WEBGPU_PREVIEW_STATUS/,
    'Silnik: status WebGPU main preview (Etap 1, kolejka)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /const ENABLE_MAIN_PREVIEW_WEBGPU_AB = isEnvMainPreviewWebGpuAb\(\);/,
    'Silnik: A/B main preview armed only by env flag',
  );
  assert.match(
    useFilmLabEngineSrc,
    /const abArmed =\s*\n\s*ENABLE_MAIN_PREVIEW_WEBGPU_AB &&\s*\n\s*String\(renderDebugInfo\?\.mainThreadWebGpuPreviewAbDecision \?\? ''\)\.startsWith\('armed_probe_ok'\);/,
    'Silnik: A/B route gate requires env flag + probe-ok decision',
  );
  assert.match(
    useFilmLabEngineSrc,
    /const fastE2ePath = usedMainThreadWebGpuAb \? 'fast-main-webgpu-ab' : 'fast-webgl';/,
    'Silnik: A/B routing tags E2E path (webgpu-ab vs webgl)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuPreviewAbPath:\s*ENABLE_MAIN_PREVIEW_WEBGPU_AB\s*\n\s*\?\s*usedMainThreadWebGpuAb\s*\n\s*\?\s*'webgpu-main'\s*\n\s*:\s*'webgl-fallback'\s*\n\s*:\s*'none'/,
    'Silnik: runtime path label respects env flag + selected route',
  );
  assert.match(
    useFilmLabEngineSrc,
    /previewE2eHostSchedToRafMs/,
    'Silnik: previewE2eHostSchedToRafMs (E2E schedule→host rAF)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /computeE2eFrameCostMedianSnapshot/,
    'Silnik: computeE2eFrameCostMedianSnapshot (rolling median frame cost)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /withPreviewE2eFrameCostGate/,
    'Silnik: withPreviewE2eFrameCostGate (READY/HOLD na worker path)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /previewE2eFrameCostMs/,
    'Silnik: previewE2eFrameCostMs w renderDebugInfo',
  );

  const uboPath = new URL('../src/engine/proxyWebGpuUniformBlock.js', import.meta.url);
  const uboSrc = fs.readFileSync(uboPath, 'utf8');
  assert.match(
    uboSrc,
    /export function buildProxyWebGpuUBlockFloat32/,
    'proxyWebGpuUniformBlock: buildProxyWebGpuUBlockFloat32 (UBlock wspolny z workerem)',
  );
  assert.match(
    uboSrc,
    /stripProxyWebGpuUBlockLutTextureBindings/,
    'proxyWebGpuUniformBlock: strip… (fallback gdy 3D LUT nie mieści się / oversize)',
  );

  const lut3dWPath = new URL('../src/engine/proxyWebGpuLut3dWrite.js', import.meta.url);
  const lut3dWSrc = fs.readFileSync(lut3dWPath, 'utf8');
  assert.match(
    lut3dWSrc,
    /createMainThreadProbe3dLutTextures/,
    'proxyWebGpuLut3dWrite: createMainThreadProbe3dLutTextures (3D LUT main: rgba8 / rgba16f wg sondy)',
  );
  assert.match(
    lut3dWSrc,
    /buildRgbaCube/,
    'proxyWebGpuLut3dWrite: buildRgbaCube (wspólne z workerem)',
  );
  assert.match(
    lut3dWSrc,
    /probeRgba16Float3dLutUsable/,
    'proxyWebGpuLut3dWrite: probeRgba16Float3dLutUsable (wspólna sonda worker + main)',
  );

  const mainThreadWgpuPath = new URL(
    '../src/filmLab/filmLabMainThreadWebGpuPreview.js',
    import.meta.url
  );
  const mainThreadWgpuSrc = fs.readFileSync(mainThreadWgpuPath, 'utf8');
  assert.match(
    mainThreadWgpuSrc,
    /probeMainThreadWebGpuPreview/,
    'filmLabMainThreadWebGpuPreview: sonda wątku głównego (§5.1.1.3)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /maxTextureDimension2D/,
    'filmLabMainThreadWebGpuPreview: odczyt maxTextureDimension2D (limity 2D main)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /ok_minimal_queue_submit/,
    'filmLabMainThreadWebGpuPreview: etykieta sukcesu sondy (minimalne submit)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /getPreferredCanvasFormat/,
    'filmLabMainThreadWebGpuPreview: getPreferredCanvasFormat (canvas swapchain)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /runMainThreadCanvasWebGpuClearPass/,
    'filmLabMainThreadWebGpuPreview: runMainThreadCanvasWebGpuClearPass (clear pass)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /MAIN_THREAD_TRIANGLE_WGSL/,
    'filmLabMainThreadWebGpuPreview: MAIN_THREAD_TRIANGLE_WGSL (minimal draw)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /runMainThreadCanvasWebGpuSolidDrawPass/,
    'filmLabMainThreadWebGpuPreview: runMainThreadCanvasWebGpuSolidDrawPass (pipeline+draw)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /MAIN_THREAD_TEX_SAMPLE_WGSL/,
    'filmLabMainThreadWebGpuPreview: MAIN_THREAD_TEX_SAMPLE_WGSL (texture sample)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /runMainThreadCanvasWebGpuTextureDrawPass/,
    'filmLabMainThreadWebGpuPreview: runMainThreadCanvasWebGpuTextureDrawPass (writeTexture+sample)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /proxyWebGpuShaders\.wgsl\?raw/,
    'filmLabMainThreadWebGpuPreview: import proxyWebGpuShaders.wgsl?raw (worker parity)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /runMainThreadCanvasWebGpuProxyShaderDrawPass/,
    'filmLabMainThreadWebGpuPreview: runMainThreadCanvasWebGpuProxyShaderDrawPass (proxy fmain)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /downscaleSourceCanvasRgba8ForWebGpuHostProbe/,
    'filmLabMainThreadWebGpuPreview: downscaleSourceCanvasRgba8ForWebGpuHostProbe (host downscale)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /probeMainThreadWebGpuHostSourceRgba8ProxyPass/,
    'filmLabMainThreadWebGpuPreview: probeMainThreadWebGpuHostSourceRgba8ProxyPass (host pixels)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /createMainThreadProbe3dLutTextures/,
    'filmLabMainThreadWebGpuPreview: createMainThreadProbe3dLutTextures (3D LUT w sondzie)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /mainThreadWebGpuLut3dTexFormat/,
    'filmLabMainThreadWebGpuPreview: mainThreadWebGpuLut3dTexFormat (telemetria 3D LUT w sondzie)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /getProbeLut3dTexFormatLabel/,
    'filmLabMainThreadWebGpuPreview: getProbeLut3dTexFormatLabel (parity z workerem)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /copyTextureToBuffer/,
    'filmLabMainThreadWebGpuPreview: copyTextureToBuffer (readback 1×1 z swapchain)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /u8RgbaToHalfFloatRgbaForTexImage/,
    'filmLabMainThreadWebGpuPreview: optional RGBA8 -> half-float conversion for source texture',
  );
  assert.match(
    mainThreadWgpuSrc,
    /writeRgba16FloatTight2d/,
    'filmLabMainThreadWebGpuPreview: writeRgba16FloatTight2d (aligned upload for rgba16float source)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /const sourceTexFormat = rgba16Candidate \? 'rgba16float' : 'rgba8unorm';/,
    'filmLabMainThreadWebGpuPreview: source texture format selection (rgba16float -> rgba8unorm fallback)',
  );
  assert.match(
    mainThreadWgpuSrc,
    /sourceTexFormat/,
    'filmLabMainThreadWebGpuPreview: sourceTexFormat exposed to caller',
  );
  assert.match(
    mainThreadWgpuSrc,
    /maxTextureDimension3D/,
    'filmLabMainThreadWebGpuPreview: odczyt maxTextureDimension3D (limity 3D main)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /probeMainThreadWebGpuPreview/,
    'Silnik: wywołanie probeMainThreadWebGpuPreview',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuMaxTextureDimension2d/,
    'Silnik: telemetria mainThreadWebGpuMaxTextureDimension2d',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuMaxTextureDimension3d/,
    'Silnik: telemetria mainThreadWebGpuMaxTextureDimension3d',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuLut3dTexFormat/,
    'Silnik: telemetria mainThreadWebGpuLut3dTexFormat (3D LUT main)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuCanvasClearPass/,
    'Silnik: telemetria mainThreadWebGpuCanvasClearPass',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuSolidDrawPass/,
    'Silnik: telemetria mainThreadWebGpuSolidDrawPass',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuTextureDrawPass/,
    'Silnik: telemetria mainThreadWebGpuTextureDrawPass',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuProxyShaderDrawPass/,
    'Silnik: telemetria mainThreadWebGpuProxyShaderDrawPass',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuHostSourceProxyPass/,
    'Silnik: telemetria mainThreadWebGpuHostSourceProxyPass',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadWebGpuHostSourceReadbackRgba8/,
    'Silnik: telemetria readback 1×1 (sonda main)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /usedMainThreadWebGpuAbSourceTexFormat/,
    'Silnik: runtime remembers main A/B source texture format',
  );
  assert.match(
    useFilmLabEngineSrc,
    /mainThreadHostWgpuSourceProbeKeyRef/,
    'Silnik: mainThreadHostWgpuSourceProbeKeyRef (ponowna sonda host po zmianie wejścia)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /buildProxyWebGpuUBlockFloat32/,
    'Silnik: buildProxyWebGpuUBlockFloat32 (UBlock parity worker w sondzie host)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /profileLutData:/,
    'Silnik: sonda host przekazuje profileLutData + U do uploadu 3D',
  );
  assert.match(
    useFilmLabEngineSrc,
    /sharedArrayBufferHost/,
    'Silnik: sharedArrayBufferHost (SAB §5.1.1.5)',
  );

  const runtimeEnvPath = new URL('../src/filmLab/runtimeEnv.js', import.meta.url);
  const runtimeEnvSrc = fs.readFileSync(runtimeEnvPath, 'utf8');
  assert.match(
    runtimeEnvSrc,
    /getSharedArrayBufferHostSnapshot/,
    'runtimeEnv: getSharedArrayBufferHostSnapshot',
  );
  assert.match(runtimeEnvSrc, /policyState/, 'runtimeEnv: SAB host policyState');
  assert.match(runtimeEnvSrc, /policyReason/, 'runtimeEnv: SAB host policyReason');
  assert.match(runtimeEnvSrc, /smokeBytes/, 'runtimeEnv: SAB smokeBytes');
  assert.match(runtimeEnvSrc, /smokeOk/, 'runtimeEnv: SAB smokeOk');
  assert.match(runtimeEnvSrc, /blocked-no-coi/, 'runtimeEnv: SAB policy blocked-no-coi');
  assert.match(runtimeEnvSrc, /ready/, 'runtimeEnv: SAB policy ready');

  assert.match(
    filmLabRenderDebugSrc,
    /policy /,
    'Panel: SharedArrayBuffer line includes policy label',
  );
  assert.match(
    filmLabRenderDebugSrc,
    /smoke /,
    'Panel: SharedArrayBuffer line includes smoke status',
  );
  assert.match(
    runtimeEnvSrc,
    /isEnvCpuPreviewMatchNominal/,
    'runtimeEnv: isEnvCpuPreviewMatchNominal (CPU preview match nominal §5.1.1.2)',
  );

  const proxyComputePath = new URL('../src/engine/proxyComputeSize.js', import.meta.url);
  const proxyComputeSrc = fs.readFileSync(proxyComputePath, 'utf8');
  assert.match(
    proxyComputeSrc,
    /getNominalProxyRenderSize/,
    'proxyComputeSize: getNominalProxyRenderSize (CPU/proxy DRY §5.1.1.2)',
  );
  const proxyWorkerPath = new URL('../src/engine/workers/proxyRenderWorker.js', import.meta.url);
  const proxyWorkerSrcForParity = fs.readFileSync(proxyWorkerPath, 'utf8');
  assert.match(
    proxyWorkerSrcForParity,
    /tryCpuOutputTiles/,
    'proxyRenderWorker: tryCpuOutputTiles (CPU nominal przy PROXY_OUTPUT_TILES, §5.1.1.2 kafle)',
  );
  assert.match(
    proxyWorkerSrcForParity,
    /getProxyCpuYieldEveryRowCount/,
    'proxyRenderWorker: getProxyCpuYieldEveryRowCount (opcj. yield w pętli CPU)',
  );
  assert.match(
    proxyWorkerSrcForParity,
    /proxyWorkerWebGl3dLutRgba16f/,
    'proxyRenderWorker: proxyWorkerWebGl3dLutRgba16f (3D LUT half WebGL2)',
  );
  const webgl2ProbePath = new URL('../src/engine/webgl2Rgba16fFboProbe.js', import.meta.url);
  const webgl2ProbeSrc = fs.readFileSync(webgl2ProbePath, 'utf8');
  assert.match(
    webgl2ProbeSrc,
    /probeWebgl2Rgba16fFboUsable/,
    'webgl2Rgba16fFboProbe: wspólna sonda FBO (main fast + worker WebGL2)',
  );
  const webgl2Probe3dPath = new URL('../src/engine/webgl2Rgba16f3dLutProbe.js', import.meta.url);
  const webgl2Probe3dSrc = fs.readFileSync(webgl2Probe3dPath, 'utf8');
  assert.match(
    webgl2Probe3dSrc,
    /probeWebgl2Rgba16f3dLutUsable/,
    'webgl2Rgba16f3dLutProbe: sonda 3D LUT half (proxy WebGL2 §5.1.1.1)',
  );
  assert.match(
    webgl2Probe3dSrc,
    /webglU8RgbaToHalfFloat/,
    'webgl2Rgba16f3dLutProbe: import webglU8RgbaToHalfFloat',
  );
  const webglU8RgbaToHalfPath = new URL('../src/engine/webglU8RgbaToHalfFloat.js', import.meta.url);
  const webglU8RgbaToHalfSrc = fs.readFileSync(webglU8RgbaToHalfPath, 'utf8');
  assert.match(
    webglU8RgbaToHalfSrc,
    /u8RgbaToHalfFloatRgbaForTexImage/,
    'webglU8RgbaToHalfFloat: wspólna konwersja RGBA8 → half (fast + worker §5.1.1.1)',
  );
  const fastPreviewPath = new URL('../src/engine/preview/fastPreviewRenderer.js', import.meta.url);
  const fastPreviewSrcForHalf = fs.readFileSync(fastPreviewPath, 'utf8');
  assert.match(
    fastPreviewSrcForHalf,
    /webglU8RgbaToHalfFloat/,
    'fastPreviewRenderer: import webglU8RgbaToHalfFloat (wspólny half)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /getNominalProxyRenderSize/,
    'Silnik: import getNominalProxyRenderSize',
  );
  assert.match(useFilmLabEngineSrc, /cpuParityMatchNominal/, 'Silnik: telemetria CPU nominal parity');
  assert.match(useFilmLabEngineSrc, /cpuParityDownscaled/, 'Silnik: telemetria CPU downscale do nominalu');
  assert.match(useFilmLabEngineSrc, /isEnvCpuPreviewMatchNominal/, 'Silnik: isEnvCpuPreviewMatchNominal');
  assert.match(
    useFilmLabEngineSrc,
    /proxyWorkerCpuFullNominalParity/,
    'Silnik: telemetria proxyWorkerCpuFullNominalParity (CPU pełen nominal, kafle §5.1.1.2)',
  );
  assert.match(
    useFilmLabEngineSrc,
    /proxyWorkerWebGl3dLutRgba16f/,
    'Silnik: telemetria proxyWorkerWebGl3dLutRgba16f (3D LUT WebGL2 worker)',
  );

  assert.equal(lutCoverage.missing.length, 0, `Missing LUT files: ${lutCoverage.missing.join(', ')}`);
  assert.equal(fuzz.clippingMismatchCount, 0, 'Manual clipping policy mismatch detected');
  assert.equal(fuzz.numericViolations, 0, 'Found NaN/Infinity or invalid WB gains');
  assert.ok(fuzz.wbLumaDriftMax <= 0.02, `WB luminance drift too high: ${fuzz.wbLumaDriftMax}`);
  assert.equal(monotonicity.violations, 0, 'WB monotonicity violations detected');
  assert.ok(kelvinRoundtrip.maxError <= 1, `Kelvin roundtrip error too high: ${kelvinRoundtrip.maxError}`);

  console.log('PASS Deep Film Lab audit');
  console.log(
    JSON.stringify(
      {
        proxySourceFit,
        lutCoverage: {
          required: lutCoverage.requiredCount,
          existing: lutCoverage.existingCount,
          missing: lutCoverage.missing.length,
        },
        fuzz: {
          iterations: fuzz.iterations,
          clippingMismatchCount: fuzz.clippingMismatchCount,
          numericViolations: fuzz.numericViolations,
          wbLumaDriftMax: Number(fuzz.wbLumaDriftMax.toFixed(6)),
          avgMs: formatMs(fuzz.avgMs),
          p50Ms: formatMs(fuzz.p50Ms),
          p95Ms: formatMs(fuzz.p95Ms),
          p99Ms: formatMs(fuzz.p99Ms),
          maxMs: formatMs(fuzz.maxMs),
        },
        monotonicity,
        kelvinRoundtrip,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error('FAIL Deep Film Lab audit');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
}

