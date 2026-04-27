import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const DEFAULT_MANIFEST_RELATIVE = 'data/raw/reference/reference-manifest.json';
const DEFAULT_REPORTS_RELATIVE = 'data/raw/reference/reports';
const DEFAULT_MIN_ITEMS = 30;
const DEFAULT_THRESHOLDS = Object.freeze({
  maxHighlightClipRatio: 0.12,
  maxShadowClipRatio: 0.16,
  maxAbMeanDelta: 24,
  allowBlackGuard: false,
  allowSuspectedBlackFrame: false,
});

function resolveProjectRoot() {
  const currentFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFilePath), '..');
}

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST_RELATIVE,
    reportsDir: DEFAULT_REPORTS_RELATIVE,
    minItems: DEFAULT_MIN_ITEMS,
    /** Gdy `true` — nie łącz z poprzednim manifestem (czysta regeneracja expected/thresholds z raportów). */
    noMerge: false,
    /** Gdy `true` — przelicz i wpisz progi quality (maxDeltaEMean/maxDeltaEP95/minSsim). */
    applySuggestedThresholds: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--no-merge') {
      options.noMerge = true;
      continue;
    }
    if (current === '--apply-suggested-thresholds') {
      options.applySuggestedThresholds = true;
      continue;
    }
    if (current === '--manifest' && argv[index + 1]) {
      options.manifest = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === '--reports-dir' && argv[index + 1]) {
      options.reportsDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (current === '--min' && argv[index + 1]) {
      const numeric = Number(argv[index + 1]);
      if (Number.isFinite(numeric) && numeric > 0) {
        options.minItems = Math.max(1, Math.floor(numeric));
      }
      index += 1;
      continue;
    }
  }

  return options;
}

function toFiniteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function formatJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function listJsonReports(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json') &&
        !entry.name.startsWith('._')
    )
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, 'en'));
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const finite = values.filter((item) => Number.isFinite(item));
  if (!finite.length) {
    return null;
  }
  return finite.reduce((acc, item) => acc + item, 0) / finite.length;
}

function quantile(values, q) {
  const finite = values.filter((item) => Number.isFinite(item)).sort((a, b) => a - b);
  if (!finite.length) {
    return null;
  }
  const clampedQ = Math.max(0, Math.min(1, Number(q)));
  const idx = (finite.length - 1) * clampedQ;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return finite[lo];
  }
  const t = idx - lo;
  return finite[lo] * (1 - t) + finite[hi] * t;
}

function roundTo(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function srgbToLinear01(v8) {
  const x = Math.max(0, Math.min(255, Number(v8))) / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function rgb8ToLab(r8, g8, b8) {
  const r = srgbToLinear01(r8);
  const g = srgbToLinear01(g8);
  const b = srgbToLinear01(b8);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856451679035631 ? t ** (1 / 3) : 7.787037037037037 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function getByPath(objectValue, dotPath) {
  const pathValue = String(dotPath ?? '').trim();
  if (!pathValue) {
    return undefined;
  }
  const segments = pathValue.split('.').map((item) => item.trim()).filter(Boolean);
  let current = objectValue;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function decodePngFromDataUrl(dataUrl) {
  const raw = String(dataUrl ?? '');
  if (!raw.startsWith('data:image/png;base64,')) {
    return null;
  }
  try {
    const base64 = raw.slice('data:image/png;base64,'.length);
    const buffer = Buffer.from(base64, 'base64');
    return PNG.sync.read(buffer, { colorType: 6 });
  } catch {
    return null;
  }
}

function decodePngFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath);
    return PNG.sync.read(raw, { colorType: 6 });
  } catch {
    return null;
  }
}

function computeQualityMetrics(projectRoot, qualityComparison) {
  const qc = qualityComparison ?? null;
  if (!qc || typeof qc !== 'object') {
    return null;
  }
  const candidatePath = String(qc?.candidateImage ?? '').trim();
  const referencePath = String(qc?.referenceImage ?? '').trim();
  const candidateReportPath = String(qc?.candidateReport ?? '').trim();
  const referenceReportPath = String(qc?.referenceReport ?? '').trim();
  const dataUrlPath = String(qc?.dataUrlPath ?? 'pipeline.rawBackendComparison.diffHeatmap.dataUrl').trim();

  let cand = null;
  let ref = null;
  if (candidatePath && referencePath) {
    cand = decodePngFile(path.resolve(projectRoot, candidatePath));
    ref = decodePngFile(path.resolve(projectRoot, referencePath));
  } else if (candidateReportPath && referenceReportPath) {
    const candidatePayload = readJsonIfExists(path.resolve(projectRoot, candidateReportPath));
    const referencePayload = readJsonIfExists(path.resolve(projectRoot, referenceReportPath));
    cand = decodePngFromDataUrl(getByPath(candidatePayload, dataUrlPath));
    ref = decodePngFromDataUrl(getByPath(referencePayload, dataUrlPath));
  } else {
    return null;
  }
  if (!cand || !ref) {
    return null;
  }

  const width = Math.min(Number(cand.width) || 0, Number(ref.width) || 0);
  const height = Math.min(Number(cand.height) || 0, Number(ref.height) || 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  const deltaEs = [];
  const yCand = [];
  const yRef = [];
  const n = width * height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const iCand = (y * cand.width + x) * 4;
      const iRef = (y * ref.width + x) * 4;
      const rc = cand.data[iCand];
      const gc = cand.data[iCand + 1];
      const bc = cand.data[iCand + 2];
      const rr = ref.data[iRef];
      const gr = ref.data[iRef + 1];
      const br = ref.data[iRef + 2];
      const lc = rgb8ToLab(rc, gc, bc);
      const lr = rgb8ToLab(rr, gr, br);
      const dL = lc.l - lr.l;
      const dA = lc.a - lr.a;
      const dB = lc.b - lr.b;
      deltaEs.push(Math.sqrt(dL * dL + dA * dA + dB * dB));
      yCand.push(srgbToLinear01(rc) * 0.2126 + srgbToLinear01(gc) * 0.7152 + srgbToLinear01(bc) * 0.0722);
      yRef.push(srgbToLinear01(rr) * 0.2126 + srgbToLinear01(gr) * 0.7152 + srgbToLinear01(br) * 0.0722);
    }
  }
  const deltaEMean = toFiniteOrNull(mean(deltaEs));
  const deltaEP95 = toFiniteOrNull(quantile(deltaEs, 0.95));
  const muX = mean(yCand) ?? 0;
  const muY = mean(yRef) ?? 0;
  let varX = 0;
  let varY = 0;
  let cov = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = yCand[i] - muX;
    const dy = yRef[i] - muY;
    varX += dx * dx;
    varY += dy * dy;
    cov += dx * dy;
  }
  const denom = Math.max(1, n - 1);
  varX /= denom;
  varY /= denom;
  cov /= denom;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  const ssim = toFiniteOrNull(
    ((2 * muX * muY + c1) * (2 * cov + c2)) / ((muX * muX + muY * muY + c1) * (varX + varY + c2))
  );
  return { deltaEMean, deltaEP95, ssim };
}

function buildSuggestedThresholds(metrics) {
  if (!metrics) {
    return null;
  }
  const meanDelta = toFiniteOrNull(metrics.deltaEMean);
  const p95Delta = toFiniteOrNull(metrics.deltaEP95);
  const ssim = toFiniteOrNull(metrics.ssim);
  if (meanDelta == null && p95Delta == null && ssim == null) {
    return null;
  }
  return {
    maxDeltaEMean: meanDelta == null ? null : roundTo(Math.max(1, meanDelta * 1.15), 3),
    maxDeltaEP95: p95Delta == null ? null : roundTo(Math.max(2, p95Delta * 1.15), 3),
    minSsim:
      ssim == null
        ? null
        : roundTo(Math.max(0, Math.min(1, ssim - Math.max(0.02, (1 - ssim) * 0.1))), 4),
  };
}

/**
 * Pola gate'a DCP/ICC v0 / kolorymetryki — z DIAG (`pipeline.rawColorimetry` + `pipeline.info.capabilities`).
 * LibRaw (`librawDevelopSettings`, `librawMetadataSummary`) tylko gdy obecne w raporcie.
 */
function buildColorimetryExpected(reportPayload) {
  const caps = reportPayload?.pipeline?.info?.capabilities ?? {};
  const rawCm = reportPayload?.pipeline?.rawColorimetry ?? null;
  const probe =
    caps?.rawProbeSnapshot && typeof caps.rawProbeSnapshot === 'object'
      ? caps.rawProbeSnapshot
      : null;
  const stage =
    (rawCm?.colorPipeline?.stage ?? caps?.colorPipeline?.stage ?? probe?.colorPipeline?.stage ?? null)
      ?.toString?.()
      .trim() || null;
  const adapterRaw =
    rawCm?.decodeAdapterId ?? caps?.rawDecodeAdapter ?? probe?.rawDecodeAdapter ?? null;
  const adapter =
    adapterRaw != null && String(adapterRaw).trim() !== '' ? String(adapterRaw).trim() : null;

  /** @type {Record<string, unknown>} */
  const out = {};
  if (stage) {
    out.colorPipelineStage = stage;
  }
  if (adapter) {
    out.rawDecodeAdapter = adapter;
  }

  const dev = rawCm?.librawDevelopSettings ?? caps?.librawDevelopSettings ?? null;
  if (dev && typeof dev === 'object') {
    const mx = dev.useCameraMatrix;
    if (Number.isFinite(Number(mx))) {
      out.librawUseCameraMatrix = Math.floor(Number(mx));
    }
    const cp = dev.cameraProfile;
    if (cp != null && String(cp).trim() !== '') {
      const low = String(cp).trim().toLowerCase();
      out.librawCameraProfile = low === 'embed' ? 'embed' : low;
    }
  }

  const summary = rawCm?.librawMetadataSummary ?? caps?.librawMetadataSummary ?? null;
  if (summary && typeof summary === 'object') {
    const make = summary.make;
    const model = summary.model;
    if (make != null && String(make).trim() !== '') {
      out.librawMake = String(make).trim();
    }
    if (model != null && String(model).trim() !== '') {
      out.librawModel = String(model).trim();
    }
  }

  return out;
}

function buildReferenceEntry(projectRoot, absoluteReportPath) {
  const fileName = path.basename(absoluteReportPath);
  const id = fileName.replace(/\.json$/i, '');
  let reportPayload = null;
  try {
    reportPayload = JSON.parse(fs.readFileSync(absoluteReportPath, 'utf8'));
  } catch (_error) {
    console.warn(`WARN  Pomijam uszkodzony/nie-JSON raport: ${fileName}`);
    return null;
  }
  const pipelineKind = reportPayload?.pipeline?.info?.pipelineKind;
  const qualityQa = reportPayload?.render?.qualityQa ?? null;
  if (pipelineKind !== 'raw' || !qualityQa) {
    return null;
  }

  const selectedBackend = String(
    reportPayload?.pipeline?.rawBackendComparison?.selectedBackend ?? ''
  ).trim();
  const relativeReportPath = path.relative(projectRoot, absoluteReportPath).replaceAll('\\', '/');
  const metrics = qualityQa?.metrics ?? {};
  const colorimetryExpected = buildColorimetryExpected(reportPayload);
  const expected = {
    ...(selectedBackend ? { selectedBackend } : {}),
    ...colorimetryExpected,
  };

  return {
    id,
    report: relativeReportPath,
    expected,
    thresholds: {
      maxHighlightClipRatio:
        toFiniteOrNull(metrics?.highlightClipRatio) != null
          ? Math.max(DEFAULT_THRESHOLDS.maxHighlightClipRatio, Number(metrics.highlightClipRatio) * 1.35)
          : DEFAULT_THRESHOLDS.maxHighlightClipRatio,
      maxShadowClipRatio:
        toFiniteOrNull(metrics?.shadowClipRatio) != null
          ? Math.max(DEFAULT_THRESHOLDS.maxShadowClipRatio, Number(metrics.shadowClipRatio) * 1.35)
          : DEFAULT_THRESHOLDS.maxShadowClipRatio,
      maxAbMeanDelta:
        toFiniteOrNull(metrics?.abMeanDelta) != null
          ? Math.max(DEFAULT_THRESHOLDS.maxAbMeanDelta, Number(metrics.abMeanDelta) * 1.35)
          : DEFAULT_THRESHOLDS.maxAbMeanDelta,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = resolveProjectRoot();
  const manifestPath = path.resolve(projectRoot, options.manifest);
  const reportsDirectory = path.resolve(projectRoot, options.reportsDir);

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(reportsDirectory, { recursive: true });

  const existingManifest = readJsonIfExists(manifestPath);
  const existingThresholds =
    existingManifest?.defaultThresholds && typeof existingManifest.defaultThresholds === 'object'
      ? existingManifest.defaultThresholds
      : {};
  const reportFiles = listJsonReports(reportsDirectory);
  /** @type {Map<string, object>} */
  const prevByReport = new Map();
  if (!options.noMerge && Array.isArray(existingManifest?.references)) {
    for (const ref of existingManifest.references) {
      const key = String(ref?.report ?? '')
        .trim()
        .replaceAll('\\', '/');
      if (key) {
        prevByReport.set(key, ref);
      }
    }
  }

  const references = reportFiles
    .map((absolutePath) => {
      const entry = buildReferenceEntry(projectRoot, absolutePath);
      if (!entry) {
        return null;
      }
      const prev = prevByReport.get(entry.report);
      if (prev && typeof prev === 'object') {
        if (prev.expected && typeof prev.expected === 'object') {
          entry.expected = { ...prev.expected, ...entry.expected };
        }
        if (prev.thresholds && typeof prev.thresholds === 'object') {
          entry.thresholds = { ...entry.thresholds, ...prev.thresholds };
        }
        if (prev.qualityComparison && typeof prev.qualityComparison === 'object') {
          entry.qualityComparison = { ...prev.qualityComparison };
        }
      }
      if (options.applySuggestedThresholds && entry.qualityComparison && typeof entry.qualityComparison === 'object') {
        const metrics = computeQualityMetrics(projectRoot, entry.qualityComparison);
        const suggested = buildSuggestedThresholds(metrics);
        if (suggested) {
          entry.thresholds = {
            ...entry.thresholds,
            ...(suggested.maxDeltaEMean != null ? { maxDeltaEMean: suggested.maxDeltaEMean } : {}),
            ...(suggested.maxDeltaEP95 != null ? { maxDeltaEP95: suggested.maxDeltaEP95 } : {}),
            ...(suggested.minSsim != null ? { minSsim: suggested.minSsim } : {}),
          };
        }
      }
      return entry;
    })
    .filter(Boolean);

  const manifestPayload = {
    name: existingManifest?.name || 'mindfullens-raw-reference-v1-local',
    description:
      existingManifest?.description ||
      'Manifest generowany automatycznie z raportów DIAG JSON (RAW).',
    defaultThresholds: {
      ...DEFAULT_THRESHOLDS,
      ...existingThresholds,
    },
    references,
  };

  fs.writeFileSync(manifestPath, formatJson(manifestPayload), 'utf8');

  if (!options.noMerge && prevByReport.size > 0) {
    console.log(
      `INFO  Scalono expected/thresholds z poprzedniego manifestu (wpisy po ścieżce report). Pełna regeneracja: npm run raw:manifest:build:fresh`
    );
  }
  if (options.applySuggestedThresholds) {
    console.log('INFO  Zastosowano suggested thresholds dla wpisów z qualityComparison (gdy metryki były policzalne).');
  }

  console.log(
    `OK  Zaktualizowano manifest RAW: ${path.relative(projectRoot, manifestPath)} (pozycji: ${references.length})`
  );
  if (references.length < options.minItems) {
    console.warn(
      `WARN  Masz ${references.length}/${options.minItems} raportów. Do bramki potrzeba minimum ${options.minItems}.`
    );
  } else {
    console.log(`OK  Minimalny próg ${options.minItems} raportów spełniony.`);
  }
}

main();
